#!/bin/bash
set -e

echo "=========================================="
echo "Cyber Guide 手动部署脚本"
echo "=========================================="

# 颜色输出
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

# 1. 更新系统
echo -e "${GREEN}[1/8] 更新系统...${NC}"
sudo apt update

# 2. 安装 PostgreSQL
echo -e "${GREEN}[2/8] 安装 PostgreSQL...${NC}"
sudo apt install -y postgresql postgresql-contrib

# 3. 安装 Redis
echo -e "${GREEN}[3/8] 安装 Redis...${NC}"
sudo apt install -y redis-server

# 4. 安装 Java 21
echo -e "${GREEN}[4/8] 安装 Java 21...${NC}"
sudo apt install -y openjdk-21-jdk maven

# 5. 安装 Node.js 20
echo -e "${GREEN}[5/8] 安装 Node.js 20...${NC}"
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 6. 配置数据库
echo -e "${GREEN}[6/8] 配置数据库...${NC}"
read -p "请输入数据库密码（默认：cyber123）: " DB_PASSWORD
DB_PASSWORD=${DB_PASSWORD:-cyber123}

sudo -u postgres psql -c "DROP DATABASE IF EXISTS cyber_guide;" || true
sudo -u postgres psql -c "DROP USER IF EXISTS cyber_guide;" || true
sudo -u postgres psql -c "CREATE DATABASE cyber_guide;"
sudo -u postgres psql -c "CREATE USER cyber_guide WITH PASSWORD '$DB_PASSWORD';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE cyber_guide TO cyber_guide;"
sudo -u postgres psql -d cyber_guide -c "GRANT ALL ON SCHEMA public TO cyber_guide;"

# 7. 配置环境变量
echo -e "${GREEN}[7/8] 配置环境变量...${NC}"
cd ~/cyber-guide

if [ ! -f .env ]; then
    cp .env.example .env
fi

read -p "请输入智谱 API Key: " OPENAI_KEY
read -p "请输入服务器 IP 地址: " SERVER_IP

# 更新 .env 文件
sed -i "s|OPENAI_API_KEY=.*|OPENAI_API_KEY=$OPENAI_KEY|g" .env
sed -i "s|POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$DB_PASSWORD|g" .env
sed -i "s|POSTGRES_HOST=.*|POSTGRES_HOST=localhost|g" .env
sed -i "s|REDIS_HOST=.*|REDIS_HOST=localhost|g" .env
sed -i "s|NEXT_PUBLIC_API_BASE_URL=.*|NEXT_PUBLIC_API_BASE_URL=http://$SERVER_IP:8080|g" .env
sed -i "s|CRAWLER_ENABLED=.*|CRAWLER_ENABLED=false|g" .env

# 生成随机 JWT Secret
JWT_SECRET=$(openssl rand -base64 32)
sed -i "s|JWT_SECRET=.*|JWT_SECRET=$JWT_SECRET|g" .env

echo -e "${GREEN}环境变量配置完成！${NC}"

# 8. 构建和启动服务
echo -e "${GREEN}[8/8] 构建和启动服务...${NC}"

# 启动 Redis
sudo systemctl start redis-server
sudo systemctl enable redis-server

# 启动 PostgreSQL
sudo systemctl start postgresql
sudo systemctl enable postgresql

# 构建后端
echo -e "${GREEN}构建后端...${NC}"
cd ~/cyber-guide/backend
export POSTGRES_HOST=localhost
export POSTGRES_PORT=5432
export POSTGRES_DB=cyber_guide
export POSTGRES_USER=cyber_guide
export POSTGRES_PASSWORD=$DB_PASSWORD
export REDIS_HOST=localhost
export REDIS_PORT=6379
export OPENAI_API_KEY=$OPENAI_KEY
export JWT_SECRET=$JWT_SECRET

./mvnw clean package -DskipTests

# 启动后端（后台运行）
echo -e "${GREEN}启动后端...${NC}"
nohup java -jar target/*.jar > ~/backend.log 2>&1 &
echo $! > ~/backend.pid
echo -e "${GREEN}后端已启动，PID: $(cat ~/backend.pid)${NC}"

# 等待后端启动
echo "等待后端启动..."
sleep 10

# 构建前端
echo -e "${GREEN}构建前端...${NC}"
cd ~/cyber-guide/frontend
npm install
npm run build

# 启动前端（后台运行）
echo -e "${GREEN}启动前端...${NC}"
nohup npm start > ~/frontend.log 2>&1 &
echo $! > ~/frontend.pid
echo -e "${GREEN}前端已启动，PID: $(cat ~/frontend.pid)${NC}"

echo ""
echo "=========================================="
echo -e "${GREEN}部署完成！${NC}"
echo "=========================================="
echo ""
echo "访问地址："
echo "  前端: http://$SERVER_IP:3000"
echo "  后端: http://$SERVER_IP:8080"
echo ""
echo "日志文件："
echo "  后端日志: ~/backend.log"
echo "  前端日志: ~/frontend.log"
echo ""
echo "管理命令："
echo "  查看后端日志: tail -f ~/backend.log"
echo "  查看前端日志: tail -f ~/frontend.log"
echo "  停止后端: kill \$(cat ~/backend.pid)"
echo "  停止前端: kill \$(cat ~/frontend.pid)"
echo "  重启后端: kill \$(cat ~/backend.pid) && cd ~/cyber-guide/backend && nohup java -jar target/*.jar > ~/backend.log 2>&1 & echo \$! > ~/backend.pid"
echo "  重启前端: kill \$(cat ~/frontend.pid) && cd ~/cyber-guide/frontend && nohup npm start > ~/frontend.log 2>&1 & echo \$! > ~/frontend.pid"
echo ""
echo "=========================================="
