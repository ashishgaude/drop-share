// Configuration
const CHUNK_SIZE = 16384; // 16KB chunks (safe for WebRTC)

const app = {
    peer: null,
    conn: null,
    fileToSend: null,
    incomingFileInfo: null,
    receivedChunks: [],
    receivedSize: 0,
    
    // UI Helpers
    showScreen: (id) => {
        document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
        document.getElementById(id).classList.add('active');
    },

    updateProgress: (percent) => {
        document.getElementById('progress-bar').style.width = percent + '%';
        document.getElementById('progress-text').innerText = Math.floor(percent) + '%';
    },

    generateShortId: () => {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let result = '';
        for (let i = 0; i < 4; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    },

    formatBytes: (bytes, decimals = 2) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    },

    // --- SENDER LOGIC ---

    initSender: () => {
        app.showScreen('sender-step-1');
        
        // Setup Drag & Drop
        const dropZone = document.getElementById('drop-zone');
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('dragover');
        });
        dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
            if (e.dataTransfer.files.length) {
                app.handleFileSelect(e.dataTransfer.files[0]);
            }
        });
    },

    handleFileSelect: (file) => {
        if (!file) return;
        app.fileToSend = file;
        
        // Show file info
        document.getElementById('file-name-display').innerText = file.name;
        document.getElementById('file-size-display').innerText = `(${app.formatBytes(file.size)})`;
        
        app.startHosting();
    },

    startHosting: () => {
        app.showScreen('sender-step-2');
        
        const peerId = app.generateShortId();
        document.getElementById('sender-id-display').innerText = peerId;

        app.peer = new Peer(peerId, { debug: 1 });

        app.peer.on('open', (id) => {
            console.log('Sender ready on ID:', id);
        });

        app.peer.on('connection', (conn) => {
            console.log("Receiver connected!");
            app.conn = conn;
            
            // Handle connection ready
            app.conn.on('open', () => {
                // 1. Send Metadata
                app.conn.send({
                    type: 'metadata',
                    name: app.fileToSend.name,
                    size: app.fileToSend.size,
                    fileType: app.fileToSend.type
                });
            });

            // Listen for 'ack' to start sending data
            app.conn.on('data', (data) => {
                if (data === 'ready-for-data') {
                    app.sendFileData();
                }
            });
        });
    },

    sendFileData: async () => {
        app.showScreen('transfer-screen');
        document.getElementById('transfer-status').innerText = "Sending...";
        
        const file = app.fileToSend;
        let offset = 0;

        // Reading and sending loop
        const reader = new FileReader();
        
        reader.onload = (e) => {
            const chunk = e.target.result;
            
            // Send chunk
            app.conn.send({
                type: 'chunk',
                data: chunk
            });

            offset += chunk.byteLength;

            // Update UI
            const percent = (offset / file.size) * 100;
            app.updateProgress(percent);

            // Continue or Finish
            if (offset < file.size) {
                readNextChunk();
            } else {
                console.log("File sent completely.");
                app.conn.send({ type: 'eof' });
                document.getElementById('transfer-status').innerText = "Sent Successfully!";
            }
        };

        const readNextChunk = () => {
            const slice = file.slice(offset, offset + CHUNK_SIZE);
            reader.readAsArrayBuffer(slice);
        };

        // Start reading
        readNextChunk();
    },

    // --- RECEIVER LOGIC ---

    initReceiver: () => {
        app.showScreen('receiver-step-1');
    },

    connectToSender: () => {
        const hostId = document.getElementById('receiver-id-input').value.toUpperCase().trim();
        if (hostId.length !== 4) return alert("Invalid ID");

        app.peer = new Peer(); // Random ID for receiver

        app.peer.on('open', () => {
            console.log("Receiver connecting to", hostId);
            app.conn = app.peer.connect(hostId);

            app.conn.on('open', () => {
                console.log("Connected to Sender");
                app.showScreen('transfer-screen');
                document.getElementById('transfer-status').innerText = "Waiting for file info...";
            });

            app.conn.on('data', (data) => {
                app.handleIncomingData(data);
            });
            
            app.conn.on('error', (err) => alert("Connection Error: " + err));
        });
        
        app.peer.on('error', (err) => {
            alert("Peer Error: " + err.type);
        });
    },

    handleIncomingData: (data) => {
        if (data.type === 'metadata') {
            app.incomingFileInfo = data;
            app.receivedChunks = [];
            app.receivedSize = 0;
            
            document.getElementById('transfer-status').innerText = `Receiving ${data.name}...`;
            console.log("Metadata received:", data);
            
            // Tell sender we are ready
            app.conn.send('ready-for-data');
        } 
        else if (data.type === 'chunk') {
            app.receivedChunks.push(data.data);
            app.receivedSize += data.data.byteLength;
            
            const percent = (app.receivedSize / app.incomingFileInfo.size) * 100;
            app.updateProgress(percent);
        } 
        else if (data.type === 'eof') {
            console.log("Download complete!");
            app.finalizeDownload();
        }
    },

    finalizeDownload: () => {
        document.getElementById('transfer-status').innerText = "Download Complete!";
        document.getElementById('download-actions').style.display = 'block';
        
        const blob = new Blob(app.receivedChunks, { type: app.incomingFileInfo.fileType });
        const url = URL.createObjectURL(blob);
        
        const btn = document.getElementById('download-btn');
        btn.onclick = () => {
            const a = document.createElement('a');
            a.href = url;
            a.download = app.incomingFileInfo.name;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        };
        // Auto-click for convenience? No, let user click to save.
    }
};
