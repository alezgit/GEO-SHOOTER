- Create a certs folder in the root and run this in your terminal

openssl req -x509 -newkey rsa:2048 \
 -keyout key.pem \
 -out cert.pem \
 -days 365 \
 -nodes

- Run npm install & npm run start
