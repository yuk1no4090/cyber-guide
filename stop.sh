#!/bin/bash
# Cyber Guide 停止脚本

# 停止后端
if [ -f ~/backend.pid ]; then
    kill $(cat ~/backend.pid) 2>/dev/null
    rm ~/backend.pid
    echo "后端已停止"
else
    echo "后端未运行"
fi

# 停止前端
if [ -f ~/frontend.pid ]; then
    kill $(cat ~/frontend.pid) 2>/dev/null
    rm ~/frontend.pid
    echo "前端已停止"
else
    echo "前端未运行"
fi

echo "所有服务已停止！"
