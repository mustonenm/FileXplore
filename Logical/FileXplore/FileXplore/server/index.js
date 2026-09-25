// Simple Express server for file explorer API
const express = require('express');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = 5000;

app.use(cors({
  exposedHeaders: ['X-Upload-Id']
}));
app.use(bodyParser.json());

// Load static HTTPS transfer config from a JSON file at server startup.
const staticHttpsConfigPath = path.join(__dirname, 'https-config.json');
let staticTransferConfig = null;
try {
  if (fs.existsSync(staticHttpsConfigPath)) {
    staticTransferConfig = JSON.parse(fs.readFileSync(staticHttpsConfigPath, 'utf8'));
  }
} catch (err) {
  console.error('Failed to load static HTTPS transfer config:', err.message);
}

// Track active HTTPS uploads for cancellation support
const activeUploads = new Map();
let uploadIdCounter = 0;

function joinUrlPaths(...parts) {
  return '/' + parts
    .filter(Boolean)
    .map(part => String(part).replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .join('/');
}

function buildTransferUrl(config, endpointPath) {
  const protocol = (config.protocol || 'https').replace(/:$/, '');
  const port = config.port ? `:${config.port}` : '';
  const servicePath = joinUrlPaths(config.basePath, endpointPath);
  return `${protocol}://${config.host}${port}${servicePath}`;
}

function buildRemoteFileName(fileName, config) {
  let remoteFileName = (config.defaultFileName && config.defaultFileName.trim() !== '')
    ? config.defaultFileName
    : fileName;

  if (config.defaultFileName && config.defaultFileName.trim() !== '' && !path.extname(config.defaultFileName)) {
    remoteFileName += path.extname(fileName);
  }

  return remoteFileName;
}

function buildRemotePath(fileName, targetFolder, config) {
  const folder = targetFolder || config.defaultFolder || '';
  if (!folder) return fileName;
  return path.posix.join(folder.replace(/\\/g, '/'), fileName);
}

function toHttpHeaderValue(value) {
  return String(value)
    .replace(/[\u0000-\u001F\u007F]/g, '_')
    .replace(/[^\u0000-\u00FF]/g, '_');
}

function buildHttpsAgentOptions(config) {
  if ((config.protocol || 'https').replace(/:$/, '') !== 'https') return {};
  return { rejectUnauthorized: config.rejectUnauthorized !== false };
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function postBufferToTransferTarget(url, body, headers, config, onRequest = () => {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const transport = parsedUrl.protocol === 'https:' ? https : http;
    const requestOptions = {
      method: 'POST',
      headers: {
        'Content-Length': Buffer.byteLength(body),
        ...headers
      },
      ...buildHttpsAgentOptions(config)
    };

    const request = transport.request(parsedUrl, requestOptions, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => {
        const responseBody = Buffer.concat(chunks).toString('utf8');
        if (response.statusCode >= 200 && response.statusCode < 300) {
          resolve(responseBody);
        } else {
          reject(new Error(`HTTPS target error: ${response.statusCode} ${responseBody}`));
        }
      });
    });

    onRequest(request);
    request.setTimeout(config.timeoutMs || 300000, () => {
      request.destroy(new Error(`HTTPS request timed out after ${config.timeoutMs || 300000} ms`));
    });
    request.on('error', reject);
    request.end(body);
  });
}

async function postChunkWithRetry({ url, chunk, headers, config, upload, chunkIndex, onRetry }) {
  const maxRetries = Number.isInteger(config.maxRetries) ? config.maxRetries : 2;
  const retryDelayMs = config.retryDelayMs || 1500;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt += 1) {
    try {
      await postBufferToTransferTarget(url, chunk, headers, config, request => {
        upload.request = request;
      });
      upload.request = null;
      return attempt;
    } catch (err) {
      upload.request = null;
      if (upload.cancelled) throw new Error('Upload cancelled');
      if (attempt > maxRetries) throw err;
      onRetry({ chunkIndex, attempt, maxAttempts: maxRetries + 1, error: err.message });
      await delay(retryDelayMs);
    }
  }
}

async function uploadFileInChunks({ url, filePath, remoteFileName, remotePath, transferId, config, upload, onProgress, onRetry }) {
  const fileSize = fs.statSync(filePath).size;
  const chunkSize = Math.max(1, Math.min(config.chunkSizeBytes || 16384, 16384));
  const readStream = fs.createReadStream(filePath, { highWaterMark: chunkSize });
  let offset = 0;
  let chunkIndex = 0;

  upload.readStream = readStream;

  try {
    for await (const chunk of readStream) {
      if (upload.cancelled) throw new Error('Upload cancelled');

      const finalChunk = offset + chunk.length >= fileSize;
      const headers = {
        'Content-Type': config.contentType || 'application/octet-stream',
        fileName: toHttpHeaderValue(remoteFileName),
        remotePath: toHttpHeaderValue(remotePath),
        transferId,
        chunkOffset: offset.toString(),
        chunkIndex: chunkIndex.toString(),
        fileSize: fileSize.toString(),
        finalChunk: finalChunk ? '1' : '0'
      };

      await postChunkWithRetry({
        url,
        chunk,
        headers,
        config,
        upload,
        chunkIndex,
        onRetry
      });

      offset += chunk.length;
      chunkIndex += 1;
      onProgress(offset, fileSize, chunkIndex);
    }
  } finally {
    upload.readStream = null;
  }
}

// Cancel an active HTTPS upload
app.post('/api/cancel-upload', (req, res) => {
  const { uploadId } = req.body;
  if (!uploadId) return res.status(400).json({ error: 'Missing uploadId' });
  
  const upload = activeUploads.get(uploadId);
  if (!upload) {
    return res.status(404).json({ error: 'Upload not found or already completed' });
  }
  
  try {
    upload.cancelled = true;
    if (upload.readStream) upload.readStream.destroy(new Error('Upload cancelled'));
    if (upload.request) upload.request.destroy(new Error('Upload cancelled'));
    
    // Clean up temp file if this upload used one.
    if (upload.tempFilePath && fs.existsSync(upload.tempFilePath)) {
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
          fs.statSync(drivePath);
          drives.push({
            letter: letter,
            path: drivePath,
            type: 'drive'
          });
        }
      } catch {
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
        } catch {
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

// Stream selected file to the PLC over HTTPS using static config.
// Returns a Server-Sent Events stream for progress and retry updates.
app.post('/api/save-to-https-static', async (req, res) => {
  const { filePath, targetFolder = '' } = req.body || {};

  if (!filePath) return res.status(400).json({ error: 'Missing filePath' });
  if (!staticTransferConfig || !staticTransferConfig.host) {
    return res.status(500).json({ error: 'Static HTTPS transfer config or host missing' });
  }
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });

  const stats = fs.statSync(filePath);
  if (stats.isDirectory()) return res.status(400).json({ error: 'Path is a directory, not a file' });

  const uploadId = ++uploadIdCounter;
  const fileName = path.basename(filePath);
  const remoteFileName = buildRemoteFileName(fileName, staticTransferConfig);
  const remotePath = buildRemotePath(remoteFileName, targetFolder, staticTransferConfig);
  const uploadPath = staticTransferConfig.uploadPath || '/upload-Xfile';
  const uploadUrl = buildTransferUrl(staticTransferConfig, uploadPath);
  const upload = { fileName, request: null, readStream: null, cancelled: false };

  activeUploads.set(uploadId, upload);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Upload-Id', uploadId.toString());
  res.flushHeaders();

  const sendProgress = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const transferId = `${Date.now()}-${uploadId}`;

  try {
    sendProgress({ type: 'start', uploadId, fileSize: stats.size, remotePath, transferId });

    await uploadFileInChunks({
      url: uploadUrl,
      filePath,
      remoteFileName,
      remotePath,
      transferId,
      config: staticTransferConfig,
      upload,
      onProgress: (bytes, total, chunksSent) => {
        const percent = total > 0 ? Math.round((bytes / total) * 100) : 100;
        sendProgress({ type: 'progress', percent, bytes, total, chunksSent });
      },
      onRetry: (data) => {
        sendProgress({ type: 'retry', ...data });
      }
    });

    sendProgress({ type: 'complete', success: true, remotePath });
    res.end();
  } catch (err) {
    if (upload.cancelled || err.message === 'Upload cancelled') {
      sendProgress({ type: 'cancelled', error: 'Upload cancelled' });
    } else {
      sendProgress({ type: 'error', error: err.message });
    }
    res.end();
  } finally {
    activeUploads.delete(uploadId);
  }
});

// Ack file loaded after file has been uploaded over HTTPS.
app.post('/api/load-selected-file', async (req, res) => {
  try {
    const { fileName } = req.body;
    const config = staticTransferConfig;
    if (!config || !config.host) {
      return res.status(500).json({ error: 'HTTPS transfer config or host missing' });
    }
    const loadUrl = buildTransferUrl(config, config.loadPath || '/load-selected-Xfile');

    await postBufferToTransferTarget(loadUrl, Buffer.from('Load'), {
      'Content-Type': 'application/text',
      fileName: toHttpHeaderValue(fileName || '')
    }, config);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`File explorer backend running on http://localhost:${PORT}`);
});
