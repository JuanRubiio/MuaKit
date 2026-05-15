@echo off
cd /d "%~dp0"
node mua_ops_node\server.js --port 5055 >> "data\mua_ops\server.out.log" 2>> "data\mua_ops\server.err.log"
