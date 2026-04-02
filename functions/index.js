const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentDeleted } = require("firebase-functions/v2/firestore");
const { defineSecret } = require("firebase-functions/params");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getStorage } = require("firebase-admin/storage");
const { initializeApp } = require("firebase-admin/app");

initializeApp();

exports.cleanupExpiredMessages = onSchedule("every 24 hours", async (event) => {
    const db = getFirestore();
    const now = new Date();

    // Query all chats for expired messages using collection group query
    const chatsSnap = await db.collectionGroup("messages")
        .where("expiresAt", "<=", now)
        .limit(500)
        .get();

    if (chatsSnap.empty) {
        console.log("No expired messages found.");
        return;
    }

    const batch = db.batch();
    chatsSnap.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();

    console.log(`Deleted ${chatsSnap.size} expired messages`);
});

exports.cleanupExpiredSharedNotes = onSchedule("every 24 hours", async () => {
    const db = getFirestore();
    const storage = getStorage();
    const now = new Date();

    const snap = await db.collection("shared_notes")
        .where("expiresAt", "<=", now)
        .limit(500)
        .get();

    if (snap.empty) {
        console.log("No expired shared_notes found.");
        return;
    }

    // Delete Firestore docs and their Storage files
    const batch = db.batch();
    const storageDeletions = [];

    snap.docs.forEach(docSnap => {
        batch.delete(docSnap.ref);
        // Delete corresponding storage directory shared_notes_files/{noteId}/
        const bucket = storage.bucket();
        storageDeletions.push(
            bucket.deleteFiles({ prefix: `shared_notes_files/${docSnap.id}/` }).catch(() => {})
        );
    });

    await Promise.all([batch.commit(), ...storageDeletions]);
    console.log(`Deleted ${snap.size} expired shared_notes and their storage files`);
});

const googleClientId = defineSecret("GOOGLE_CLIENT_ID");
const googleClientSecret = defineSecret("GOOGLE_CLIENT_SECRET");

exports.refreshDriveToken = onCall({
    secrets: [googleClientId, googleClientSecret]
}, async (request) => {
    const { refresh_token } = request.data;
    if (!refresh_token) {
        throw new HttpsError("invalid-argument", "The function must be called with a 'refresh_token'.");
    }
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "The function must be called while authenticated.");
    }

    try {
        const response = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
                client_id: googleClientId.value(),
                client_secret: googleClientSecret.value(),
                refresh_token: refresh_token,
                grant_type: "refresh_token",
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            console.error("Failed to refresh token:", data);
            throw new HttpsError("internal", data.error_description || "Failed to refresh Google Drive token.");
        }

        return { access_token: data.access_token };
    } catch (error) {
        console.error("Error exchanging refresh token:", error);
        throw new HttpsError("internal", "An error occurred while refreshing the Google Drive token.");
    }
});

exports.getGoogleClientId = onCall({
    secrets: [googleClientId]
}, (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "The function must be called while authenticated.");
    }
    return { clientId: googleClientId.value() };
});

exports.exchangeDriveAuthCode = onCall({
    secrets: [googleClientId, googleClientSecret]
}, async (request) => {
    const { code } = request.data;
    if (!code) {
        throw new HttpsError("invalid-argument", "The function must be called with an authorization 'code'.");
    }
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "The function must be called while authenticated.");
    }

    try {
        const response = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
                client_id: googleClientId.value(),
                client_secret: googleClientSecret.value(),
                code: code,
                grant_type: "authorization_code",
                redirect_uri: "postmessage",
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            console.error("Failed to exchange auth code:", data);
            throw new HttpsError("internal", data.error_description || "Failed to exchange Google Drive auth code.");
        }

        return {
            access_token: data.access_token,
            refresh_token: data.refresh_token,
            expires_in: data.expires_in
        };
    } catch (error) {
        console.error("Error exchanging auth code:", error);
        throw new HttpsError("internal", "An error occurred while exchanging the Google Drive auth code.");
    }
});

// --- Collaboration & Workspace Cleanup ---

// When a shared_doc is deleted, purge its subcollections (members, presence, CRDT state/updates)
exports.onSharedDocDeleted = onDocumentDeleted(
    "artifacts/{appId}/shared_docs/{shareId}",
    async (event) => {
        const db = getFirestore();
        const docRef = event.data.ref;
        const subcollections = ["members", "crdt_updates", "crdt_state", "presence"];

        for (const sub of subcollections) {
            const refs = await docRef.collection(sub).listDocuments();
            if (refs.length > 0) {
                const batch = db.batch();
                refs.forEach(ref => batch.delete(ref));
                await batch.commit();
            }
        }
        console.log(`Purged subcollections for shared_doc ${event.params.shareId}`);
    }
);

// When a collaborator doc is deleted, remove their presence entry
exports.onCollaboratorRemoved = onDocumentDeleted(
    "artifacts/{appId}/shared_docs/{shareId}/members/{uid}",
    async (event) => {
        const db = getFirestore();
        const { appId, shareId, uid } = event.params;
        await db.doc(`artifacts/${appId}/shared_docs/${shareId}/presence/${uid}`).delete().catch(() => {});
        console.log(`Removed presence for ${uid} from shared_doc ${shareId}`);
    }
);

// When a workspace is deleted, purge its Storage files
exports.onWorkspaceDeleted = onDocumentDeleted(
    "artifacts/{appId}/workspaces/{wsId}",
    async (event) => {
        const { wsId } = event.params;
        const bucket = getStorage().bucket();
        await bucket.deleteFiles({ prefix: `workspaces/${wsId}/` }).catch(() => {});
        console.log(`Deleted storage files for workspace ${wsId}`);
    }
);

// Server-side workspace member removal with ownership validation
exports.removeWorkspaceMember = onCall(async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Must be authenticated.");
    }

    const { wsId, memberUid, appId } = request.data;
    if (!wsId || !memberUid || !appId) {
        throw new HttpsError("invalid-argument", "wsId, memberUid, and appId are required.");
    }

    const db = getFirestore();
    const wsRef = db.doc(`artifacts/${appId}/workspaces/${wsId}`);
    const wsSnap = await wsRef.get();

    if (!wsSnap.exists) {
        throw new HttpsError("not-found", "Workspace not found.");
    }

    if (wsSnap.data().createdBy !== request.auth.uid) {
        throw new HttpsError("permission-denied", "Only the workspace owner can remove members.");
    }

    await wsRef.update({ memberUids: FieldValue.arrayRemove(memberUid) });

    const updated = await wsRef.get();
    const remainingMemberUids = updated.data()?.memberUids || [];

    console.log(`Removed member ${memberUid} from workspace ${wsId}`);
    return { remainingMemberUids };
});
