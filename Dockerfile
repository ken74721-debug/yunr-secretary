FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
RUN mkdir -p /data
ENV DATA_DIR=/data
ENV PORT=8080
EXPOSE 8080
CMD ["node", "server.js"]
