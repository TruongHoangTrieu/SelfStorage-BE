/**
 * Script khởi chạy AI Service cross-platform (Windows / Linux / macOS)
 * Tự động tìm Python trong ai-service/.venv và chạy uvicorn
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const isWin = process.platform === 'win32';
const aiDir = path.join(__dirname, '..', 'ai-service');

const pythonExe = isWin
  ? path.join(aiDir, '.venv', 'Scripts', 'python.exe')
  : path.join(aiDir, '.venv', 'bin', 'python');

const uvicornExe = isWin
  ? path.join(aiDir, '.venv', 'Scripts', 'uvicorn.exe')
  : path.join(aiDir, '.venv', 'bin', 'uvicorn');

if (!fs.existsSync(pythonExe)) {
  console.error(`[AI Service] Không tìm thấy virtualenv tại: ${pythonExe}`);
  console.error(`[AI Service] Vui lòng chạy: cd ai-service && python -m venv .venv && pip install -r requirements.txt`);
  process.exit(1);
}

console.log(`[AI Service] Đang khởi chạy FastAPI tại http://localhost:8000 ...`);

const child = spawn(
  pythonExe,
  ['-m', 'uvicorn', 'app.main:app', '--host', '0.0.0.0', '--port', '8000', '--reload'],
  {
    cwd: aiDir,
    stdio: 'inherit',
    env: { ...process.env, PYTHONPATH: '.', PYTHONIOENCODING: 'utf-8' },
    shell: true,
  },
);

child.on('error', (err) => {
  console.error(`[AI Service] Lỗi khởi chạy:`, err);
});

child.on('exit', (code) => {
  console.log(`[AI Service] Đã dừng với mã: ${code}`);
});
