# VibeMeet - Real-time Video Conferencing & Collaboration (Task 3)

VibeMeet is a full-stack real-time collaboration application featuring multi-user WebRTC video calling, screen sharing, file sharing, and a shared synchronized whiteboard.

> [!NOTE]
> This is a decoupled full-stack application.
> * **Frontend Client Repository**: https://github.com/maheswari3013/realtime_communication_client-
> * **Backend Server Repository**: https://github.com/maheswari3013/realtime_communication_server

---

## ⚡ Core Features
* **Multi-User WebRTC Video Calling**: Connect with multiple participants in high-definition peer-to-peer mesh audio/video rooms.
* **Live Screen Sharing**: Swap media tracks in real-time to share screen presentations.
* **Interactive Shared Whiteboard**: Real-time canvas brainstorming with color pickers and markers. Drawing coordinates are normalized by percentage to display correctly across all screen resolutions.
* **Session Chat & File Sharing**: Instant messaging and uploads (featuring a live progress bar) with clickable download cards in the chat list.
* **Secure JWT Authentication**: Account creation and profile theme color customization.

---

## 🛠️ Technology Stack
* **Frontend**: HTML5, CSS3 (Graphite & Emerald Mint theme), Vanilla SPA JavaScript, Socket.io-client.
* **Backend**: Node.js, Express, Socket.io (Signaling & Whiteboard Sync), Multer.
* **Database**: MongoDB Atlas via Mongoose.
* **Deployment**: Vercel (Client) and Render (Server).
