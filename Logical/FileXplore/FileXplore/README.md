# File Explorer with FTP Transfer

A Vite + React file explorer application with Node.js backend designed for **B&R mappView environments**. The application enables browsing local files and transferring them to a PLC with FTP server capabilities, featuring real-time progress tracking.

## Use Case

This application is intended to run in **B&R mappView** environments where:
- The **frontend** runs in the mappView HMI interface
- The **Node.js backend** runs on a **Panel PC** or another platform capable of accessing the local file system
- The **FTP server** is a **B&R PLC** that receives the selected files from the file explorer
- Files are transferred from the Panel PC (or host platform) to the PLC via FTP

## Features

### File Browsing
- Browse files and directories from configured drives on your local machine
- Tree-view navigation with expand/collapse folders
- Drive selection dropdown
- Configurable file extension filtering (e.g., `.txt`, `.cnc`)
- Access restrictions to prevent navigation outside configured directories

### FTP Transfer
- One-click file transfer to FTP server (B&R PLC)
- Real-time upload progress tracking using Server-Sent Events (SSE)
- Visual progress bar showing actual FTP transfer percentage
- Transfer cancellation support (client and server-side)
- Automatic file load command trigger after successful upload to PLC
- Green highlight for successfully transferred files

### Configuration
- **Frontend Config** (`public/config.json`): Supported file extensions and default drive paths
- **Backend Config** (`server/ftp-config.json`): PLC FTP server credentials, default folder, and filename settings

## Project Structure

```
├── public/
│   └── config.json          # Frontend configuration
├── server/
│   ├── index.js             # Express backend server
│   └── ftp-config.json      # FTP server configuration
├── src/
│   ├── App.jsx              # Main React application
│   ├── App.css              # Application styles
│   └── main.jsx             # React entry point
└── dist/                    # Production build output
```

## Getting Started

### Backend Server (Panel PC or Host Platform)
The Node.js backend should run on a Panel PC or any platform with access to the local file system containing the files to be transferred.

```bash
cd server
node index.js
```
Server runs on `http://localhost:5000`

### Frontend (mappView HMI)
For development:
```bash
npm run dev
```
Development server runs on `http://localhost:5173`

### Production Build (for mappView deployment)
```bash
npm run build
node serve-dist.js
```
Serves production build on `http://localhost:3000`

The `dist` folder can be deployed to the mappView project.

## Running Backend as a Windows Service

To ensure the Node.js backend server runs automatically on PC startup and restarts after reboots, set it up as a Windows service.

### Option 1: Using node-windows (Recommended)

1. Install node-windows in the server directory:
```bash
cd server
npm install node-windows
```

2. Create a service installation script `install-service.js`:
```javascript
const Service = require('node-windows').Service;
const path = require('path');

// Create a new service object
const svc = new Service({
  name: 'FileExplorer Backend',
  description: 'File Explorer Node.js backend for B&R mappView',
  script: path.join(__dirname, 'index.js'),
  nodeOptions: [
    '--harmony',
    '--max_old_space_size=4096'
  ]
});

// Listen for the "install" event
svc.on('install', function() {
  svc.start();
  console.log('Service installed and started!');
});

// Install the service
svc.install();
```

3. Run the installation script as Administrator:
```bash
node install-service.js
```

4. To uninstall the service, create `uninstall-service.js`:
```javascript
const Service = require('node-windows').Service;
const path = require('path');

const svc = new Service({
  name: 'FileExplorer Backend',
  script: path.join(__dirname, 'index.js')
});

svc.on('uninstall', function() {
  console.log('Service uninstalled');
});

svc.uninstall();
```

### Option 2: Using Windows Task Scheduler

1. Open Task Scheduler (taskschd.msc)
2. Click "Create Task" (not "Create Basic Task")
3. **General tab**:
   - Name: "FileExplorer Backend"
   - Select "Run whether user is logged on or not"
   - Check "Run with highest privileges"
4. **Triggers tab**:
   - New → Begin the task: "At startup"
   - Delay task for: 30 seconds (to ensure network is ready)
5. **Actions tab**:
   - New → Action: "Start a program"
   - Program/script: `C:\Program Files\nodejs\node.exe`
   - Add arguments: `C:\path\to\your\server\index.js`
   - Start in: `C:\path\to\your\server`
6. **Conditions tab**:
   - Uncheck "Start the task only if the computer is on AC power"
7. Click OK and enter your Windows password

### Option 3: Using PM2 (Alternative)

1. Install PM2 globally:
```bash
npm install -g pm2
npm install -g pm2-windows-startup
```

2. Configure PM2 to start on boot:
```bash
pm2-startup install
```

3. Start your application with PM2:
```bash
cd server
pm2 start index.js --name "fileexplorer-backend"
pm2 save
```

### Verify Service is Running

Check if the service is running by accessing `http://localhost:5000/api/drives` in a browser or test it after a reboot.

## API Endpoints

- `GET /api/drives` - List available drives on the host platform
- `GET /api/list?path=<path>` - List directory contents from host file system
- `GET /api/read-file?path=<path>` - Read file as binary stream from host
- `POST /api/save-to-ftp-static` - Upload file to PLC FTP server with progress (SSE)
- `POST /api/cancel-upload` - Cancel active FTP upload to PLC
- `POST /api/load-selected-file` - Trigger file load command on PLC

## Technologies

- **Frontend**: React 18, Vite, CSS (deployable to B&R mappView HTML )
- **Backend**: Node.js, Express (runs on Panel PC or host platform)
- **FTP Client**: basic-ftp (for transferring files to PLC)
- **Progress Tracking**: Server-Sent Events (SSE)
- **Target**: B&R PLC with FTP server capability
