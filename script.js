// Configuration
const CHUNK_SIZE = 16384; // 16KB chunks (safe for WebRTC)

const app = {
    peer: null,
    conn: null,
    fileToSend: null,
    thumbnail: null, // Store Base64 thumbnail
    incomingFileInfo: null,
    receivedChunks: [],
    receivedSize: 0,
    
    // UI Helpers
    showScreen: (id) => {
        document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
        document.getElementById(id).classList.add('active');
        
        // Reset preview if leaving transfer screen (optional)
        if(id !== 'transfer-screen') {
            document.getElementById('preview-container').style.display = 'none';
        }
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

    // --- THUMBNAIL GENERATOR ---
    generateThumbnail: (file) => {
        // Only generate for images
        if (!file.type.match('image.*')) return Promise.resolve(null);

        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    
                    // Resize logic (max 150px)
                    const maxSize = 150;
                    let width = img.width;
                    let height = img.height;
                    
                    if (width > height) {
                        if (width > maxSize) {
                            height *= maxSize / width;
                            width = maxSize;
                        }
                    } else {
                        if (height > maxSize) {
                            width *= maxSize / height;
                            height = maxSize;
                        }
                    }
                    
                    canvas.width = width;
                    canvas.height = height;
                    ctx.drawImage(img, 0, 0, width, height);
                    
                    // Compress to low quality JPEG
                    resolve(canvas.toDataURL('image/jpeg', 0.6));
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        });
    },

    // --- SENDER LOGIC ---

    initSender: () => {
        app.showScreen('sender-step-1');
        
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
                app.handleFileSelect(e.dataTransfer.files);
            }
        });
    },

    handleFileSelect: async (fileList) => {
        if (!fileList || fileList.length === 0) return;
        
        // Reset old data
        app.thumbnail = null;

        if (fileList.length > 1) {
            document.querySelector('#sender-step-1 h2').innerText = "Zipping files...";
            document.querySelector('#drop-zone p').innerText = "Please wait...";
            
            try {
                const zip = new JSZip();
                for (let i = 0; i < fileList.length; i++) {
                    const f = fileList[i];
                    zip.file(f.name, f);
                }
                const content = await zip.generateAsync({type: "blob"});
                app.fileToSend = new File([content], "files.zip", { type: "application/zip" });
            } catch (e) {
                alert("Error zipping: " + e.message);
                return;
            }
        } else {
            app.fileToSend = fileList[0];
            // Try generating thumbnail
            try {
                app.thumbnail = await app.generateThumbnail(app.fileToSend);
            } catch(e) {
                console.error("Thumbnail failed", e);
            }
        }
        
        document.getElementById('file-name-display').innerText = app.fileToSend.name;
        document.getElementById('file-size-display').innerText = `(${app.formatBytes(app.fileToSend.size)})`;
        
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
            
            app.conn.on('open', () => {
                // 1. Send Metadata (include thumbnail if exists)
                app.conn.send({
                    type: 'metadata',
                    name: app.fileToSend.name,
                    size: app.fileToSend.size,
                    fileType: app.fileToSend.type,
                    thumbnail: app.thumbnail // <--- NEW
                });
            });

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
        
        // Show local preview for Sender too
        if (app.thumbnail) {
            document.getElementById('preview-container').style.display = 'block';
            document.getElementById('preview-img').src = app.thumbnail;
        }

        const file = app.fileToSend;
        let offset = 0;

        const reader = new FileReader();
        
        reader.onload = (e) => {
            const chunk = e.target.result;
            app.conn.send({ type: 'chunk', data: chunk });

            offset += chunk.byteLength;
            const percent = (offset / file.size) * 100;
            app.updateProgress(percent);

            if (offset < file.size) {
                // Determine next chunk
                const nextSlice = file.slice(offset, offset + CHUNK_SIZE);
                reader.readAsArrayBuffer(nextSlice);
            } else {
                console.log("File sent completely.");
                app.conn.send({ type: 'eof' });
                document.getElementById('transfer-status').innerText = "Sent Successfully!";
            }
        };

        // Start reading first chunk
        const firstSlice = file.slice(0, CHUNK_SIZE);
        reader.readAsArrayBuffer(firstSlice);
    },

    // --- RECEIVER LOGIC ---

    initReceiver: () => {
        app.showScreen('receiver-step-1');
    },

    connectToSender: () => {
        const hostId = document.getElementById('receiver-id-input').value.toUpperCase().trim();
        if (hostId.length !== 4) return alert("Invalid ID");

        app.peer = new Peer(); 

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
            
            // Show Preview if available
            if (data.thumbnail) {
                document.getElementById('preview-container').style.display = 'block';
                document.getElementById('preview-img').src = data.thumbnail;
            } else {
                document.getElementById('preview-container').style.display = 'none';
            }
            
            console.log("Metadata received:", data);
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
    }
};
