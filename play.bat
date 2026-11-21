@echo off
cd /d "%~dp0"
start "" http://localhost:8650
node tools\serve.js 8650
