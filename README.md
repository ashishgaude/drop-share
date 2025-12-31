# DropShare (P2P File Transfer)

A secure, serverless file transfer tool. Send files of any size directly from device to device using a simple 4-digit code.

## 🚀 How it Works
*   **Peer-to-Peer:** The file streams directly between browsers. It is **never** uploaded to a cloud server.
*   **Private:** No database, no accounts, no tracking.
*   **Unlimited:** Since it doesn't use server bandwidth, you can transfer files as large as your browser can handle (Gigabytes!).

## 🛠️ Tech Stack
*   **WebRTC (PeerJS):** For the direct data connection.
*   **ArrayBuffer:** For efficient binary chunking of files.
*   **Vanilla JS:** No heavy frameworks.

## 🏃‍♂️ How to Run

### 1. Start Local Server
Since this uses WebRTC, it needs to be served via HTTP/HTTPS.
```bash
python3 -m http.server 8080
```

### 2. Open in Browser
Go to `http://localhost:8080`.

### 3. Usage Guide
1.  **Sender:**
    *   Open the app on one device/tab.
    *   Click "Send".
    *   Select a file.
    *   Share the **4-digit Code** (e.g., `K9X2`) with the receiver.
2.  **Receiver:**
    *   Open the app on another device/tab.
    *   Click "Receive".
    *   Enter the code `K9X2`.
    *   Click "Download".
3.  **Transfer:**
    *   Wait for the progress bar to reach 100%.
    *   Click **"Save File"**.

## ⚠️ Important for Mobile
If transferring between a Phone and Laptop:
1.  Both devices must be on the internet (to reach the PeerJS broker for the initial handshake).
2.  You might need `ngrok` if you encounter browser security restrictions, although DataChannels usually work over HTTP on local networks better than Video/Mic.
