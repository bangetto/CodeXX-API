FROM codexx-base:latest

USER root
RUN apk add --no-cache python3

USER appuser

CMD ["sleep", "infinity"]