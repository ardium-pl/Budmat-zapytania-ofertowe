# Użyj pełnego obrazu Node.js zamiast wersji slim
FROM node:21.0.0

# Ustaw katalog roboczy
WORKDIR /app

# Skopiuj package.json i package-lock.json
COPY package*.json ./

# Zainstaluj zależności
RUN npm install --production

# Skopiuj resztę aplikacji
COPY . .

# Zainstaluj poppler-utils
RUN apt-get update && apt-get install -y poppler-utils

# Eksponuj port
EXPOSE 3000

# Ustaw komendę startową
CMD ["npm", "start"]
