FROM docker.io/nginx:alpine AS builder

RUN apk add --no-cache \
    git build-base openssl-dev pcre-dev zlib-dev \
    linux-headers cmake brotli-dev

RUN set -ex \
 && NGINX_VERSION=$(nginx -v 2>&1 | awk -F'/' '{print $2}') \
 && wget -q "https://nginx.org/download/nginx-${NGINX_VERSION}.tar.gz" \
 && tar xzf "nginx-${NGINX_VERSION}.tar.gz" \
 && git clone --recurse-submodules -j4 https://github.com/google/ngx_brotli /ngx_brotli \
 && cd "nginx-${NGINX_VERSION}" \
 && ./configure --with-compat --add-dynamic-module=/ngx_brotli \
 && make modules \
 && cp objs/ngx_http_brotli_filter_module.so /tmp/ \
 && cp objs/ngx_http_brotli_static_module.so /tmp/

FROM docker.io/nginx:alpine

COPY --from=builder /tmp/ngx_http_brotli_filter_module.so /etc/nginx/modules/
COPY --from=builder /tmp/ngx_http_brotli_static_module.so /etc/nginx/modules/

COPY dist/       /usr/share/nginx/html
COPY nginx.conf  /etc/nginx/nginx.conf

EXPOSE 4321

CMD ["nginx", "-g", "daemon off;"]
