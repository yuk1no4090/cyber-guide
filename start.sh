#!/bin/bash
# Cyber Guide 启动脚本

# 加载环境变量
cd ~/cyber-guide
source .env

# 启动后端
cd ~/cyber-guide/backend
nohup java -jar target/*.jar > ~/backend.log 2>&1 &
echo $! > ~/backend.pid
echo "后端已启动，PID: $(cat ~/backend.pid)"

# 等待后端启动
sleep 5

# 启动前端
cd ~/cyber-guide/frontend
nohup npm start > ~/frontend.log 2>&1 &
echo $! > ~/frontend.pid
echo "前端已启动，PID: $(cat ~/frontend.pid)"

echo "所有服务已启动！"
echo "访问地址: http://$(curl -s ifconfig.me):3000"
