FROM alpine

RUN apk add --no-cache shadow && \
    mkdir -p /code && \
    groupadd -g 1000 appgroup && \
    useradd -u 1000 -g appgroup -s /bin/sh appuser && \
    chown -R appuser:appgroup /code

WORKDIR /code

USER appuser

CMD ["sleep", "infinity"]