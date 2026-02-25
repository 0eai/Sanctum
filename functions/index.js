const { onSchedule } = require("firebase-functions/v2/scheduler");
const { getFirestore } = require("firebase-admin/firestore");
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
