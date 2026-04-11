FROM codexx-base:latest

USER root
RUN apk add --no-cache g++ make

USER appuser

CMD ["sleep", "infinity"]