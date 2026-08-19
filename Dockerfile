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

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
