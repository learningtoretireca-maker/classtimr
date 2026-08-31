FROM nginx:alpine

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy custom config and site files
# security-headers.conf is included by three blocks in nginx.conf — without
# this COPY the container fails to start.
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY index.html /usr/share/nginx/html/index.html
COPY fonts/ /usr/share/nginx/html/fonts/
# Icons are copied individually like everything else here — this image ships an
# explicit file list rather than the repo, so an icon left out of this block is
# an icon that exists in git and 404s in production.
COPY favicon.ico /usr/share/nginx/html/favicon.ico
COPY icon.png /usr/share/nginx/html/icon.png
COPY apple-touch-icon.png /usr/share/nginx/html/apple-touch-icon.png

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
