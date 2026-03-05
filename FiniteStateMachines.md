# Finite State Machines — Sanctum v2.0

State transition diagrams for all stateful systems in the application.

---

## 1. Application Shell FSM (`App.jsx`)

```mermaid
stateDiagram-v2
    [*] --> Loading : Page Load
    Loading --> LoggedOut : No Firebase user
    Loading --> Locked : User authenticated
    LoggedOut --> Loading : signInWithPopup success
    Locked --> Unlocked : onUnlock(masterKey)
    Unlocked --> AppView : navigate(#appId)
    AppView --> Unlocked : onExit()
    Unlocked --> SharedView : route = #view
    Unlocked --> Locked : Auto-lock timer fires
    Unlocked --> Locked : Tab hidden (if enabled)
    Unlocked --> Locked : Manual lock
    AppView --> Locked : Auto-lock timer fires
    AppView --> Locked : Tab hidden (if enabled)
    Locked --> LoggedOut : Firebase sign-out

    state Unlocked {
        [*] --> Launcher
        Launcher --> AppView : onLaunch(appId)
    }
```

---

## 2. Lock Screen FSM (`LockScreen.jsx`)

```mermaid
stateDiagram-v2
    [*] --> Idle

    state Idle {
        [*] --> WaitingForInput
    }

    state Setup {
        [*] --> EnterPasskey
        EnterPasskey --> ConfirmPasskey : passkey.length >= 8
        ConfirmPasskey --> EnterPasskey : Mismatch
        ConfirmPasskey --> Creating : Match
        Creating --> Success : Vault initialized
    }

    state Unlock {
        [*] --> EnterPasskey2
        EnterPasskey2 --> Verifying : Submit
        Verifying --> RateLimited : Wrong passkey (check thresholds)
        Verifying --> Success2 : Correct passkey
        RateLimited --> Countdown : delay > 0
        Countdown --> EnterPasskey2 : countdown = 0
        Verifying --> ArgonMigration : Legacy PBKDF2 detected
        ArgonMigration --> Success2 : Migration complete
    }

    WaitingForInput --> Setup : No salt/encryptedMasterKey
    WaitingForInput --> Unlock : Salt exists
    Success --> [*] : onUnlock(masterKey)
    Success2 --> [*] : onUnlock(masterKey)

    state HardReset {
        [*] --> ConfirmReset
        ConfirmReset --> Resetting : User confirms
        Resetting --> WaitingForInput : Vault wiped
    }

    Idle --> HardReset : User clicks Reset
```

---

## 3. Note Editor FSM (`NoteEditor.jsx`)

```mermaid
stateDiagram-v2
    [*] --> Empty : New note
    [*] --> Loaded : Existing note

    state Editing {
        [*] --> Clean
        Clean --> Dirty : User types / changes tags / adds attachment
        Dirty --> Saving : Debounce timer fires (1s)
        Saving --> Clean : Save success
        Saving --> Error : Save failed
        Error --> Dirty : Retry
    }

    Empty --> Editing : User starts typing
    Loaded --> Editing : Display note content

    state Sharing {
        [*] --> NotShared
        NotShared --> GeneratingLink : User clicks Share
        GeneratingLink --> Shared : Link generated
        Shared --> NotShared : Stop sharing
    }

    state CollaborateModal {
        [*] --> Closed
        Closed --> Open : User clicks Collaborate
        Open --> AddingUser : Search by email
        AddingUser --> Open : User added
        Open --> RemovingUser : Click remove
        RemovingUser --> Open : User removed
        RemovingUser --> ShareDeleted : Last collaborator removed
        ShareDeleted --> Closed : Reset
    }
```

---

## 4. SecureShare Chat FSM

```mermaid
stateDiagram-v2
    [*] --> Initializing : Component mount

    state Initializing {
        [*] --> CheckingKeys
        CheckingKeys --> GeneratingRSA : No RSA keys
        CheckingKeys --> Ready : RSA keys exist
        GeneratingRSA --> Ready : Keys stored
    }

    Ready --> ContactList : Show contacts

    state ContactList {
        [*] --> Browsing
        Browsing --> DMSelected : Click 1:1 contact
        Browsing --> GroupSelected : Click group
        Browsing --> CreatingGroup : Click new group
        CreatingGroup --> GroupSelected : Group created
    }

    state ChatView {
        [*] --> LoadingMessages
        LoadingMessages --> MessagesLoaded : onSnapshot fires
        MessagesLoaded --> Composing : User types
        Composing --> Sending : Submit
        Sending --> MessagesLoaded : Message sent
        MessagesLoaded --> SharingArtifact : Open share menu
        SharingArtifact --> Sending : Send artifact
    }

    DMSelected --> ChatView : navigate(#secureshare/chatId)
    GroupSelected --> ChatView : navigate(#secureshare/group/groupId)
    ChatView --> ContactList : handleBack()
```

---

## 5. Collaboration Document Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Personal : Document created

    state Personal {
        [*] --> Unshared
        Unshared --> ShareCreating : Owner initiates share
    }

    state Shared {
        [*] --> Active
        Active --> CollaboratorAdded : addDocCollaborator
        CollaboratorAdded --> Active : Key wrapped for new user
        Active --> CollaboratorRemoved : removeDocCollaborator
        CollaboratorRemoved --> KeyRotation : Generate new docKey
        KeyRotation --> Active : Re-encrypt doc + re-wrap keys
        CollaboratorRemoved --> Deleted : Last collaborator removed
    }

    ShareCreating --> Shared : shareDocument() success
    Shared --> Personal : Owner unshares
    Deleted --> Personal : Batch delete shared_docs + members
```

---

## 6. Auto-Lock Timer FSM

```mermaid
stateDiagram-v2
    [*] --> Inactive : No cryptoKey

    state Active {
        [*] --> TimerRunning
        TimerRunning --> TimerReset : User interaction event
        TimerReset --> TimerRunning : New setTimeout
        TimerRunning --> Locked : Timeout fires
    }

    state VisibilityLock {
        [*] --> Visible
        Visible --> Hidden : document.hidden = true
        Hidden --> Locked : lock_on_hidden enabled
        Hidden --> Visible : Tab visible again
    }

    Inactive --> Active : onUnlock(masterKey)
    Locked --> Inactive : setCryptoKey(null)
```

---

## 7. Workspace Lifecycle FSM

```mermaid
stateDiagram-v2
    [*] --> Creating : Owner creates workspace

    state Creating {
        [*] --> GenerateKey
        GenerateKey --> WrapKey : AES-256 key generated
        WrapKey --> Created : RSA-wrapped for owner
    }

    state Active {
        [*] --> Operational
        Operational --> MemberInvited : inviteMember()
        MemberInvited --> Operational : Key RSA-wrapped for new member
        Operational --> MemberRemoved : removeMember()
        MemberRemoved --> KeyRotated : New AES key + re-wrap all
        KeyRotated --> Operational
    }

    Created --> Active : Workspace ready
    Active --> Deleted : Owner deletes workspace
    Deleted --> [*] : Batch delete all subdocs
```
