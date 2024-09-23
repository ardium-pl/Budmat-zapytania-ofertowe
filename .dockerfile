# Użyj oficjalnego obrazu Node.js
FROM node:16-slim

# Ustaw katalog roboczy
WORKDIR /app

# Skopiuj plik package.json i package-lock.json
COPY package*.json ./

# Zainstaluj zależności
RUN npm install --production

# Skopiuj całą aplikację do obrazu
COPY . .

# Eksponuj port (jeśli aplikacja działa na danym porcie, np. 3000)
EXPOSE 3000

# Ustaw komendę startową dla aplikacji
CMD ["npm", "start"]
