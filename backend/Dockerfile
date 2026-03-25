FROM node:18-slim

# Install ffmpeg for audio conversion
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --production

COPY . .

# Create uploads directory
RUN mkdir -p uploads

EXPOSE 3001

CMD ["node", "server.js"]
