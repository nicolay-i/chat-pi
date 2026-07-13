FROM nobbe/ignis:0.8.8

COPY deploy/ignis/embed.html /opt/chat-pi/embed.html
COPY deploy/ignis/entrypoint.sh /usr/local/bin/chat-pi-ignis-entrypoint

RUN chmod 0555 /usr/local/bin/chat-pi-ignis-entrypoint

ENTRYPOINT ["/usr/local/bin/chat-pi-ignis-entrypoint"]
