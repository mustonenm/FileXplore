// Simple Express server for file explorer API
const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');
const ftp = require('basic-ftp');

const app = express();
const PORT = 5000;

app.use(cors({
  exposedHeaders: ['X-Upload-Id']
}));
app.use(bodyParser.json());
app.use('/api/save-to-ftp-static', express.raw({ type: '*/*', limit: '500mb' }));

// Load static FTP config from a JSON file at server startup
const staticFtpConfigPath = path.join(__dirname, 'ftp-config.json');
let staticFtpConfig = null;
try {
  if (fs.existsSync(staticFtpConfigPath)) {
    staticFtpConfig = JSON.parse(fs.readFileSync(staticFtpConfigPath, 'utf8'));
  }
} catch (err) {
  console.error('Failed to load static FTP config:', err.message);
}

// Track active FTP uploads for cancellation support
const activeUploads = new Map();
let uploadIdCounter = 0;

// Cancel an active FTP upload
app.post('/api/cancel-upload', (req, res) => {
  const { uploadId } = req.body;
  if (!uploadId) return res.status(400).json({ error: 'Missing uploadId' });
  
  const upload = activeUploads.get(uploadId);
  if (!upload) {
    return res.status(404).json({ error: 'Upload not found or already completed' });
  }
  
  try {
    // Close the FTP client connection
    upload.client.close();
    
    // Clean up temp file
    if (fs.existsSync(upload.tempFilePath)) {
      fs.unlinkSync(upload.tempFilePath);
    }
    
    // Remove from active uploads
    activeUploads.delete(uploadId);
    
    res.json({ success: true, message: 'Upload cancelled' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to cancel upload: ' + err.message });
  }
});

// Read file content as binary stream
app.get('/api/read-file', (req, res) => {
  const filePath = req.query.path;
  if (!filePath) return res.status(400).json({ error: 'Missing path parameter' });
  
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }
  
  try {
    const stats = fs.statSync(filePath);
    if (stats.isDirectory()) {
      return res.status(400).json({ error: 'Path is a directory, not a file' });
    }
    
    // Set content length for progress tracking
    res.setHeader('Content-Length', stats.size);
    res.setHeader('Content-Type', 'application/octet-stream');
    
    // Stream the file
    const readStream = fs.createReadStream(filePath);
    readStream.pipe(res);
    
    readStream.on('error', (err) => {
      console.error('Error reading file:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to read file' });
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get available drives (including mapped network drives)
app.get('/api/drives', (req, res) => {
  try {
    const drives = [];
    // Check common drive letters
    const driveLetters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    
    driveLetters.forEach(letter => {
      const drivePath = `${letter}:\\`;
      try {
        if (fs.existsSync(drivePath)) {
          const stats = fs.statSync(drivePath);
          drives.push({
            letter: letter,
            path: drivePath,
            type: 'drive'
          });
        }
      } catch (err) {
        // Drive not accessible, skip
      }
    });
    
    res.json(drives);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List files and directories in a given path
app.get('/api/list', (req, res) => {
  const dirPath = req.query.path || process.cwd();
  
  // Normalize path for network drives and UNC paths
  const normalizedPath = path.normalize(dirPath);
  
  fs.readdir(normalizedPath, { withFileTypes: true }, (err, files) => {
    if (err) {
      // Provide more specific error messages for network drives
      if (err.code === 'ENOENT') {
        return res.status(404).json({ error: `Path not found: ${normalizedPath}` });
      } else if (err.code === 'EACCES') {
        return res.status(403).json({ error: `Access denied to: ${normalizedPath}` });
      } else if (err.code === 'ENOTDIR') {
        return res.status(400).json({ error: `Not a directory: ${normalizedPath}` });
      }
      return res.status(500).json({ error: err.message });
    }
    
    // Map files with additional verification for directories
    const result = files.map(f => {
      const itemPath = path.join(normalizedPath, f.name);
      let isDir = f.isDirectory();
      
      // Double-check with fs.statSync for network drives (sometimes isDirectory() fails)
      if (!isDir) {
        try {
          const stats = fs.statSync(itemPath);
          isDir = stats.isDirectory();
        } catch (e) {
          // If stat fails, trust the original isDirectory() result
        }
      }
      
      return {
        name: f.name,
        isDirectory: isDir,
        path: itemPath
      };
    });
    
    // Sort: folders first, then files (both alphabetically)
    result.sort((a, b) => {
      // If one is directory and other is not, directory comes first
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      // If both are same type, sort alphabetically (case-insensitive)
      return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    });
    
    res.json(result);
  });
});

// Save selected file to FTP server
app.post('/api/save-to-ftp', async (req, res) => {
  const { filePath, ftpConfig } = req.body;
  if (!filePath || !ftpConfig) return res.status(400).json({ error: 'Missing filePath or ftpConfig' });
  const client = new ftp.Client();
  try {
    await client.access(ftpConfig);
    await client.uploadFrom(filePath, path.basename(filePath));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    client.close();
  }
});

// Save selected file to FTP server using config from a JSON file
app.post('/api/save-to-ftp-json', async (req, res) => {
  const { filePath, configPath } = req.body;
  if (!filePath || !configPath) return res.status(400).json({ error: 'Missing filePath or configPath' });
  let ftpConfig;
  try {
    const configRaw = fs.readFileSync(configPath, 'utf8');
    ftpConfig = JSON.parse(configRaw);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to read or parse FTP config: ' + err.message });
  }
  const client = new ftp.Client();
  try {
    await client.access(ftpConfig);
    await client.uploadFrom(filePath, path.basename(filePath));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    client.close();
  }
});

// Save selected file to FTP server using static config, with optional target folder
// Returns Server-Sent Events stream for progress updates
app.post('/api/save-to-ftp-static', async (req, res) => {
  // Get file metadata from headers
  const fileName = req.headers['x-file-name'];
  const targetFolder = req.headers['x-target-folder'] || '';
  
  if (!fileName) return res.status(400).json({ error: 'Missing X-File-Name header' });
  if (!staticFtpConfig) return res.status(500).json({ error: 'Static FTP config not loaded' });
  if (!Buffer.isBuffer(req.body)) return res.status(400).json({ error: 'Expected binary file data in request body' });
  
  const uploadId = ++uploadIdCounter;
  const client = new ftp.Client();
  const tempFilePath = path.join(__dirname, 'temp_upload_' + Date.now() + '_' + fileName);
  
  // Track this upload for cancellation
  activeUploads.set(uploadId, { client, tempFilePath, fileName });
  
  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Upload-Id', uploadId.toString());
  res.flushHeaders();
  
  const sendProgress = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };
  
  try {
    // Write buffer to temp file
    fs.writeFileSync(tempFilePath, req.body);
    const fileSize = fs.statSync(tempFilePath).size;
    
    sendProgress({ type: 'start', uploadId, fileSize });
    
    await client.access(staticFtpConfig);
    
    // Use defaultFileName from config if not empty, otherwise use original filename
    let remoteFileName = (staticFtpConfig.defaultFileName && staticFtpConfig.defaultFileName.trim() !== '') 
      ? staticFtpConfig.defaultFileName 
      : fileName;
    
    // If defaultFileName is provided but has no extension, add the extension from the original file
    if (staticFtpConfig.defaultFileName && staticFtpConfig.defaultFileName.trim() !== '') {
      const configExt = path.extname(staticFtpConfig.defaultFileName);
      if (!configExt) {
        const originalExt = path.extname(fileName);
        remoteFileName = remoteFileName + originalExt;
      }
    }
    
    // Use targetFolder from headers, or defaultFolder from config, or root
    const folder = targetFolder || staticFtpConfig.defaultFolder || '';
    let remotePath = remoteFileName;
    if (folder) {
      await client.ensureDir(folder);
      remotePath = path.posix.join(folder.replace(/\\/g, '/'), remoteFileName);
    }
    
    // Track FTP upload progress
    client.trackProgress(info => {
      if (info.type === 'upload') {
        const percent = Math.round((info.bytes / fileSize) * 100);
        sendProgress({ type: 'progress', percent, bytes: info.bytes, total: fileSize });
      }
    });
    
    await client.uploadFrom(tempFilePath, remotePath);
    
    sendProgress({ type: 'complete', success: true });
    res.end();
  } catch (err) {
    sendProgress({ type: 'error', error: err.message });
    res.end();
  } finally {
    activeUploads.delete(uploadId);
    client.close();
    // Clean up temp file
    try {
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
    } catch (cleanupErr) {
      console.error('Failed to delete temp file:', cleanupErr);
    }
  }
});

// New endpoint: ack file loaded --> after file has been uploaded over FTP
app.post('/api/load-selected-file', async (req, res) => {
  try {
    const { fileName } = req.body;
    // Send HTTP POST to the FTP server IP (from config) to trigger file load
    const config = staticFtpConfig;
    if (!config || !config.host) {
      return res.status(500).json({ error: 'FTP config or host missing' });
    }
    // Example: POST to http://<host>/load-selected-file (adjust path as needed)
    const url = `http://${config.host}/load-selected-Xfile`;
    // You may need to adjust the payload and endpoint to match your file controller's API
    const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
    
    const fileRes = await fetch(url, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/text',
        'fileName': fileName || ''
      },
      body: 'Load', // Adjust payload as needed
    });
    if (!fileRes.ok) {
      const text = await fileRes.text();
      return res.status(500).json({ error: `file HTTP error: ${fileRes.status} ${text}` });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`File explorer backend running on http://localhost:${PORT}`);
});
