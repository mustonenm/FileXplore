import { useState, useEffect } from 'react'
import './App.css'

// Configuration will be loaded dynamically
let SUPPORTED_FILE_EXTENSIONS = [];
let DEFAULT_PATHS = {};
let API_BASE_URL = 'http://localhost:5000';

function TreeNode({ node, onOpen, level, onOpenDir, selectedPath, lastTransferredFile }) {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isFolder = node.isDirectory;
  const fileName = node.name.toLowerCase();
  const isSupportedFile = SUPPORTED_FILE_EXTENSIONS.some(ext => fileName.endsWith(ext.toLowerCase()));
  const isSelected = selectedPath === node.path;
  const isTransferred = lastTransferredFile === node.path;

  function handleExpand(e) {
    e.stopPropagation();
    if (!expanded) {
      setLoading(true);
      setError('');
      fetch(`${API_BASE_URL}/api/list?path=${encodeURIComponent(node.path)}`)
        .then(res => res.json())
        .then(data => {
          setChildren(data);
          setExpanded(true);
          setLoading(false);
        })
        .catch(() => {
          setError('Failed to load directory');
          setLoading(false);
        });
    } else {
      setExpanded(false);
    }
  }

  function handleClick() {
    if (node.isDirectory && onOpenDir) {
      onOpenDir(node);
      return;
    }
    if (isSupportedFile) {
      if (onOpen) onOpen(node);
      window.lastSelectedFilePath = node.path; // Always set selected file
    }
  }

  return (
    <>
      {isSupportedFile || isFolder ? (
        <li
          className={
            (isFolder ? 'explorer-folder' : 'explorer-file') +
            (isSelected ? ' explorer-selected' : '')
          }
          style={{ paddingLeft: `${level * 20}px` }}
          onClick={handleClick}
        >
          {isFolder && (
            <span
              className="explorer-expand"
              onClick={handleExpand}
              style={{ cursor: 'pointer', marginRight: 4 }}
            >
              {expanded ? '▼' : '▶'}
            </span>
          )}
          <span className="explorer-icon">{isFolder ? '📁' : '📄'}</span>
          <span 
            className="explorer-name" 
            style={{ color: isTransferred ? '#4caf50' : 'inherit' }}
          >
            {node.name}
          </span>
          {loading && <span className="explorer-loading" style={{ marginLeft: 8 }}>Loading...</span>}
          {error && <span className="explorer-error" style={{ marginLeft: 8 }}>{error}</span>}
        </li>
      ) : null}
      {expanded && isFolder && (
        <ul className="explorer-list">
          {children.map(child => (
            <TreeNode key={child.path} node={child} onOpen={onOpen} level={level + 1} onOpenDir={onOpenDir} selectedPath={selectedPath} lastTransferredFile={lastTransferredFile} />
          ))}
        </ul>
      )}
    </>
  );
}

function FileExplorer({ onOpenFile }) {
  const [rootItems, setRootItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [currentPath, setCurrentPath] = useState('');
  const [selectedPath, setSelectedPath] = useState(null);
  const [availableDrives, setAvailableDrives] = useState([]);
  const [customPath, setCustomPath] = useState('');
  const [initialized, setInitialized] = useState(false);
  const [lastTransferredFile, setLastTransferredFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [currentXhr, setCurrentXhr] = useState(null);

  // Check if a path is allowed based on DEFAULT_PATHS configuration
  function isPathAllowed(path) {
    if (!path) return false;
    // Check if path starts with any of the configured drives
    const allowedDrives = Object.keys(DEFAULT_PATHS);
    return allowedDrives.some(drive => path.toUpperCase().startsWith(drive.toUpperCase()));
  }

  // Safely set current path only if allowed
  function safeSetCurrentPath(newPath) {
    if (isPathAllowed(newPath)) {
      setCurrentPath(newPath);
      setError('');
    } else {
      setError('Access to this location is not allowed. Only configured drives are accessible.');
    }
  }

  // Refresh available drives from the system
  function refreshDrives(callback) {
    fetch(`${API_BASE_URL}/api/drives`)
      .then(res => res.json())
      .then(drives => {
        console.log('Refreshed drives:', drives);
        if (Array.isArray(drives)) {
          const filteredDrives = drives.filter(drive => {
            return DEFAULT_PATHS[drive.path] && DEFAULT_PATHS[drive.path].trim() !== '';
          });
          setAvailableDrives(filteredDrives);
          if (callback) callback(filteredDrives, drives);
        }
      })
      .catch(err => {
        console.error('Failed to refresh drives:', err);
        if (callback) callback([], []);
      });
  }

  // Initialize: Load available drives and set initial path
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/drives`)
      .then(res => res.json())
      .then(drives => {
        console.log('Available drives:', drives);
        if (Array.isArray(drives)) {
          // Filter drives: only show drives that are configured AND exist on the system
          const filteredDrives = drives.filter(drive => {
            return DEFAULT_PATHS[drive.path] && DEFAULT_PATHS[drive.path].trim() !== '';
          });
          setAvailableDrives(filteredDrives);

          // Find the first accessible configured drive to use as initial path
          const savedPath = localStorage.getItem('lastExplorerPath');
          
          // Try saved path first if it's allowed and accessible
          if (savedPath && isPathAllowed(savedPath) && drives.some(d => savedPath.toUpperCase().startsWith(d.path.toUpperCase()))) {
            setCurrentPath(savedPath);
          } 
          // Otherwise, use the first available configured drive
          else if (filteredDrives.length > 0) {
            const firstDrive = filteredDrives[0].path;
            const initialPath = DEFAULT_PATHS[firstDrive] || firstDrive;
            setCurrentPath(initialPath);
          } 
          // No configured drives are available
          else {
            setError('None of the configured drives are available on this system. Please check your drive configuration.');
          }
          
          setInitialized(true);
        }
      })
      .catch(err => {
        console.error('Failed to load drives:', err);
        setError('Failed to connect to backend server. Please ensure the server is running.');
        setInitialized(true);
      });
  }, []);

  // Load directory contents when currentPath changes
  useEffect(() => {
    // Don't try to load if not initialized or no path set
    if (!initialized || !currentPath) return;

    setLoading(true);
    setError('');
    console.log('Fetching directory:', currentPath);
    fetch(`${API_BASE_URL}/api/list?path=${encodeURIComponent(currentPath)}`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to load');
        return res.json();
      })
      .then(data => {
        // console.log('Directory content:', data);
        // console.log('Number of items:', data?.length);
        if (Array.isArray(data)) {
          // if (data.length > 0) {
          //   console.log('Sample item:', data[0]);
          // }
          const folders = data.filter(item => item.isDirectory);
          const files = data.filter(item => !item.isDirectory);
          // console.log('Folders:', folders.length, folders.map(f => f.name));
          // console.log('Files:', files.length, files.map(f => f.name));
          setRootItems(data);
        } else if (data.error) {
          setError(data.error);
          setRootItems([]);
        } else {
          setRootItems([]);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error('Error loading directory:', err);
        setError('Failed to load directory: ' + err.message);
        setRootItems([]);
        setLoading(false);
      });
    // Save last opened path
    localStorage.setItem('lastExplorerPath', currentPath);
  }, [currentPath, initialized]);

  function handleOpenDir(item) {
    if (item.isDirectory) safeSetCurrentPath(item.path);
  }

  function handleOpenFile(node) {
    setSelectedPath(node.path);
    window.lastSelectedFilePath = node.path;
    if (onOpenFile) onOpenFile(node, (filePath) => {
      setLastTransferredFile(filePath);
    }, setUploadProgress, setCurrentXhr);
  }

  return (
    <div className="explorer-container">
      {!initialized ? (
        <div className="explorer-loading" style={{ padding: '40px', textAlign: 'center' }}>
          Initializing file explorer...
        </div>
      ) : !currentPath ? (
        <div className="explorer-error" style={{ padding: '40px', textAlign: 'center' }}>
          <h3 style={{ marginBottom: '15px' }}>No drives available</h3>
          <p>{error || 'No configured drives were found on this system.'}</p>
          <p style={{ marginTop: '10px', fontSize: '14px', color: '#888' }}>
            Configured drives: {Object.keys(DEFAULT_PATHS).join(', ')}
          </p>
        </div>
      ) : (
        <>
          <div className="explorer-header" style={{ position: 'sticky', top: 0, zIndex: 2, background: '#000', paddingBottom: '10px' }}>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              {/* Show refresh button only when there's an error */}
              {error ? (
                <button
                  className="up-btn"
                  onClick={() => {
                    refreshDrives((filteredDrives) => {
                      if (filteredDrives.length > 0) {
                        setError('');
                        const firstDrive = filteredDrives[0].path;
                        const targetPath = DEFAULT_PATHS[firstDrive] || firstDrive;
                        setCurrentPath(targetPath);
                      } else {
                        setError('No configured drives are currently available.');
                      }
                    });
                  }}
                  title="Refresh available drives"
                >
                  🔄 Refresh
                </button>
              ) : (
                <>
                  {/* Normal navigation buttons - only show when no error */}
                  <button
                    className="up-btn"
                    onClick={() => {
                      const normalized = currentPath.replace(/\\+$/, '');
                      const parts = normalized.split(/\\/);
                      const up = parts.slice(0, -1).join('\\');
                      const finalPath = up.match(/^[A-Z]:$/) ? up + '\\' : up;
                      
                      // Check if going up would leave the configured default path
                      const currentDrive = currentPath.match(/^[A-Z]:\\/)?.[0];
                      const configuredPath = currentDrive ? DEFAULT_PATHS[currentDrive] : null;
                      
                      if (finalPath && configuredPath) {
                        const normalizedConfigPath = configuredPath.replace(/\\+$/, '');
                        const normalizedFinalPath = finalPath.replace(/\\+$/, '');
                        
                        // Only allow navigation if the target path is within or equal to the configured path
                        if (normalizedFinalPath.length >= normalizedConfigPath.length) {
                          safeSetCurrentPath(finalPath);
                        }
                      } else if (finalPath) {
                        safeSetCurrentPath(finalPath);
                      }
                    }}
                    disabled={(() => {
                      // Disable if at drive root OR at the configured default path boundary
                      const normalized = currentPath.replace(/\\+$/, '');
                      const currentDrive = currentPath.match(/^[A-Z]:\\/)?.[0];
                      const configuredPath = currentDrive ? DEFAULT_PATHS[currentDrive] : null;
                      
                      if (configuredPath) {
                        const normalizedConfigPath = configuredPath.replace(/\\+$/, '');
                        return normalized === normalizedConfigPath || normalized.length <= normalizedConfigPath.length;
                      }
                      
                      return currentPath.match(/^[A-Z]:\\?$/) !== null;
                    })()}
                  >
                    <svg width="18" height="18" viewBox="0 0 20 20" style={{ verticalAlign: 'middle', marginRight: 4 }}>
                      <polyline points="14 12 10 8 6 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    Up
                  </button>

                  <button
                    className="up-btn"
                    onClick={() => {
                      // Refresh drives list first
                      refreshDrives((filteredDrives) => {
                        // Extract current drive from currentPath (e.g., "C:\\" from "C:\\Temp\\test")
                        const currentDrive = currentPath.match(/^[A-Z]:\\/)?.[0];
                        
                        if (currentDrive && DEFAULT_PATHS[currentDrive]) {
                          // Navigate to the configured default path for the current drive
                          safeSetCurrentPath(DEFAULT_PATHS[currentDrive]);
                        } else if (filteredDrives.length > 0) {
                          // Fallback: go to first available drive
                          const firstDrive = filteredDrives[0].path;
                          const targetPath = DEFAULT_PATHS[firstDrive] || firstDrive;
                          safeSetCurrentPath(targetPath);
                        } else {
                          setError('No configured drives are currently available.');
                        }
                      });
                    }}
                    title="Refresh and go to default path"
                  >
                    🏠 Home
                  </button>
                  
                  <select 
                    value={currentPath.match(/^[A-Z]:\\/)?.[0] || currentPath}
                    onFocus={() => {
                      // Refresh drives list when dropdown is opened
                      refreshDrives();
                    }}
                    onChange={(e) => {
                      const selectedDrive = e.target.value;
                      refreshDrives((filteredDrives, allDrives) => {
                        if (allDrives.some(d => d.path === selectedDrive)) {
                          const targetPath = DEFAULT_PATHS[selectedDrive] || selectedDrive;
                          safeSetCurrentPath(targetPath);
                        } else {
                          setError(`Drive ${selectedDrive} is not currently available. Please reconnect the drive and try again.`);
                        }
                      });
                    }}
                    style={{ 
                      padding: '6px 10px', 
                      borderRadius: '4px', 
                      border: '1px solid #555',
                      background: '#222',
                      color: '#fff',
                      cursor: 'pointer'
                    }}
                  >
                    {availableDrives.map(drive => (
                      <option key={drive.letter} value={drive.path}>
                        {drive.letter}: Drive
                      </option>
                    ))}
                  </select>
                </>
              )}
            </div>
          </div>
          
          {!error && (
            <div style={{ fontSize: '18px', color: '#888', textAlign: 'left', paddingLeft: '0', marginTop: '8px' }}>
              {currentPath}
            </div>
          )}
                    {uploadProgress !== null && (
            <div style={{ padding: '10px 0', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '12px', color: '#888', marginBottom: '4px' }}>
                  Uploading to FTP... {uploadProgress}%
                </div>
                <div style={{ width: '100%', height: '4px', background: '#222', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{ width: `${uploadProgress}%`, height: '100%', background: '#4caf50', transition: 'width 0.3s ease' }} />
                </div>
              </div>
              <button
                onClick={() => {
                  if (currentXhr) {
                    currentXhr.abort();
                    setCurrentXhr(null);
                  }
                }}
                style={{
                  padding: '6px 12px',
                  background: '#d32f2f',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  whiteSpace: 'nowrap'
                }}
              >
                ⏹ Stop
              </button>
            </div>
          )}
                    <div className="explorer-content">
            {loading && <div className="explorer-loading">Loading...</div>}
            {error && (
              <div className="explorer-error" style={{ padding: '20px' }}>
                <p style={{ marginBottom: '15px' }}>{error}</p>
                {availableDrives.length > 0 && (
                  <button
                    onClick={() => {
                      refreshDrives((filteredDrives) => {
                        if (filteredDrives.length > 0) {
                          const firstDrive = filteredDrives[0].path;
                          const targetPath = DEFAULT_PATHS[firstDrive] || firstDrive;
                          safeSetCurrentPath(targetPath);
                        }
                      });
                    }}
                    style={{
                      padding: '8px 16px',
                      borderRadius: '4px',
                      border: '1px solid #555',
                      background: '#007acc',
                      color: '#fff',
                      cursor: 'pointer'
                    }}
                  >
                    🔄 Refresh & Go Home
                  </button>
                )}
              </div>
            )}
            {!loading && !error && rootItems.length === 0 && (
              <div className="explorer-empty">This folder is empty.</div>
            )}
            <ul className="explorer-list">
              {rootItems.map(item => (
                <TreeNode key={item.path} node={item} onOpen={handleOpenFile} level={0} onOpenDir={handleOpenDir} selectedPath={selectedPath} lastTransferredFile={lastTransferredFile} />
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

function App() {
  const [configLoaded, setConfigLoaded] = useState(false);
  const [configError, setConfigError] = useState(null);

  // Load configuration from public/config.json on app start
  useEffect(() => {
    fetch('/config.json')
      .then(res => {
        if (!res.ok) throw new Error('Config file not found');
        return res.json();
      })
      .then(config => {
        if (!config.supportedFileExtensions || !config.defaultPaths) {
          throw new Error('Invalid config.json: missing required fields (supportedFileExtensions or defaultPaths)');
        }
        if (Object.keys(config.defaultPaths).length === 0) {
          throw new Error('Invalid config.json: defaultPaths cannot be empty');
        }
        SUPPORTED_FILE_EXTENSIONS = config.supportedFileExtensions;
        DEFAULT_PATHS = config.defaultPaths;
        // Set API base URL from config
        const server = config.server || 'localhost';
        const serverPort = config.serverPort || 5000;
        API_BASE_URL = `http://${server}:${serverPort}`;
        setConfigLoaded(true);
        console.log('Configuration loaded:', config);
        console.log('API Base URL:', API_BASE_URL);
      })
      .catch(err => {
        console.error('Failed to load config.json:', err);
        setConfigError(err.message);
      });
  }, []);

  function handleOpenFile(node, onTransferSuccess, setUploadProgress, setCurrentXhr) {
    window.lastSelectedFilePath = node.path;
    // Call handleSaveToFTP immediately when a file is selected
    handleSaveToFTP(node.path, '', onTransferSuccess, setUploadProgress, setCurrentXhr);
  }

  async function handleSaveToFTP(selectedPath, targetFolder, onTransferSuccess, setUploadProgress, setCurrentXhr) {
    if (setUploadProgress) setUploadProgress(0);
    
    try {
      // First, fetch the file content from the backend
      const fileResponse = await fetch(`${API_BASE_URL}/api/read-file?path=${encodeURIComponent(selectedPath)}`);
      if (!fileResponse.ok) {
        throw new Error('Failed to read file from server');
      }
      const fileBlob = await fileResponse.blob();
      
      // Now upload with SSE for progress tracking
      const fileName = selectedPath.split('\\').pop();
      const uploadResponse = await fetch(`${API_BASE_URL}/api/save-to-ftp-static`, {
        method: 'POST',
        headers: {
          'X-File-Name': fileName,
          'X-Target-Folder': targetFolder || ''
        },
        body: fileBlob
      });
      
      if (!uploadResponse.ok) {
        throw new Error('Upload failed: ' + uploadResponse.statusText);
      }
      
      // Read SSE stream for progress updates
      const reader = uploadResponse.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // Keep incomplete line in buffer
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.substring(6));
              
              if (data.type === 'start') {
                console.log('FTP upload started, file size:', (data.fileSize / (1024 * 1024)).toFixed(2), 'MB');
                if (setUploadProgress) setUploadProgress(0);
              } else if (data.type === 'progress') {
                // console.log('FTP progress:', data.percent + '%');
                if (setUploadProgress) setUploadProgress(data.percent);
              } else if (data.type === 'complete') {
                console.log('File uploaded to FTP server successfully!');
                if (setUploadProgress) setUploadProgress(null);
                
                // Mark file as transferred
                if (onTransferSuccess) onTransferSuccess(selectedPath);
                
                // After successful upload, trigger file load HTTP command
                fetch(`${API_BASE_URL}/api/load-selected-file`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ fileName: fileName })
                })
                  .then(res => res.json())
                  .then(loadData => {
                    if (loadData.success) {
                      console.log('file program loaded successfully!');
                    } else {
                      alert('Failed to load file program: ' + (loadData.error || 'Unknown error'));
                    }
                  })
                  .catch(() => alert('Failed to send file load command'));
              } else if (data.type === 'error') {
                console.error('Upload error:', data.error);
                if (setUploadProgress) setUploadProgress(null);
                alert('Failed to upload: ' + data.error);
              }
            } catch (e) {
              console.error('Failed to parse SSE data:', e);
            }
          }
        }
      }
      
    } catch (error) {
      if (setUploadProgress) setUploadProgress(null);
      alert('Failed to upload file: ' + error.message);
      console.error('Upload error:', error);
    }
  }

  return (
    <div className="App app-flex">
      {configError ? (
        <div style={{ color: '#fff', padding: '40px', textAlign: 'center' }}>
          <h2 style={{ color: '#ff4444', marginBottom: '20px' }}>⚠️ Configuration Error</h2>
          <p style={{ fontSize: '16px', marginBottom: '10px' }}>{configError}</p>
          <p style={{ color: '#888', fontSize: '14px' }}>Please ensure <code>public/config.json</code> exists and contains valid configuration:</p>
          <pre style={{ 
            background: '#222', 
            padding: '15px', 
            borderRadius: '5px', 
            textAlign: 'left', 
            maxWidth: '500px', 
            margin: '20px auto',
            fontSize: '12px'
          }}>{`{
  "supportedFileExtensions": [".txt", ".cnc"],
  "defaultPaths": {
    "D:\\\\": "D:\\\\",
    "Y:\\\\": "Y:\\\\"
  }
}`}</pre>
        </div>
      ) : configLoaded ? (
        <FileExplorer onOpenFile={handleOpenFile} />
      ) : (
        <div style={{ color: '#fff', padding: '20px' }}>Loading configuration...</div>
      )}
    </div>
  );
}

export default App;
