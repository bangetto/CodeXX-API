FROM alpine
RUN apk add --no-cache g++ make
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
RUN mkdir /code && chown appuser:appgroup /code
WORKDIR /code
USER appuser