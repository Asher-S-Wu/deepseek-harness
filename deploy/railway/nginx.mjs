/** Railway edge routes; only Nginx listens on the public service port. */

/**
 * Render the HTTPS edge proxy's Nginx configuration.
 * @param {{port: number, host: string, version: string}} config - Validated listener and package metadata.
 * @returns {string} Configuration preserving streaming and the private launch-token exchange.
 */
export function nginxConfig({ port, host, version }) {
  return String.raw`worker_processes 1;
pid /tmp/harness-nginx.pid;
error_log stderr warn;
events { worker_connections 1024; }
http {
  access_log off;
  client_max_body_size 100m;
  map $http_upgrade $connection_upgrade { default upgrade; '' close; }
  limit_req_zone $binary_remote_addr zone=login:1m rate=10r/m;
  server {
    listen ${port};
    server_name ${host};
    absolute_redirect off;
    if ($request_uri ~* "(\\x5c|%5c)") { return 400; }
    location = /version.json {
      default_type application/json;
      add_header Cache-Control 'no-store';
      return 200 '{"version":"${version}"}';
    }
    location = /healthz { proxy_pass http://127.0.0.1:3090/healthz; }
    location = /__auth/login {
      limit_req zone=login burst=10 nodelay;
      limit_req_status 429;
      client_max_body_size 4k;
      proxy_pass http://127.0.0.1:3090;
      proxy_set_header Host ${host};
      proxy_cookie_flags ~ secure httponly samesite=strict;
    }
    location = /connect { return 404; }
    location = / {
      if ($args != "") { return 303 /; }
      proxy_pass http://127.0.0.1:3080;
      proxy_set_header Host ${host};
      proxy_intercept_errors on;
      error_page 401 = @login;
      proxy_cookie_flags ~ secure httponly samesite=strict;
    }
    location @login {
      proxy_pass http://127.0.0.1:3090;
      proxy_set_header Host ${host};
    }
    location / {
      proxy_pass http://127.0.0.1:3080/;
      proxy_http_version 1.1;
      proxy_set_header Host $http_host;
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection $connection_upgrade;
      proxy_set_header X-Forwarded-Proto https;
      proxy_buffering off;
      proxy_read_timeout 3600s;
      proxy_send_timeout 3600s;
      proxy_cookie_flags ~ secure httponly samesite=strict;
    }
  }
}
`
}
