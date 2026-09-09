# syntax=docker/dockerfile:1.7

ARG NODE_VERSION=24-bookworm-slim
ARG PNPM_VERSION=11.19.0

FROM node:${NODE_VERSION} AS base
ARG PNPM_VERSION
ENV PNPM_HOME=/pnpm
ENV PATH=${PNPM_HOME}:${PATH}
WORKDIR /app
RUN npm install --global "pnpm@${PNPM_VERSION}"
RUN apt-get update \
    && apt-get install --yes --no-install-recommends ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/*

FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pinvites-pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

FROM dependencies AS production-dependencies
RUN pnpm prune --prod

FROM dependencies AS builder
COPY . .
# Prisma's configuration validates DATABASE_URL while generating. These values
# exist only in the build stage; the application reads real secrets at runtime.
ENV DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build
ENV BASE_URL=https://build.pinvites.invalid
ENV APP_SECRET=build-only-placeholder-that-is-never-used-at-runtime
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN --mount=type=cache,id=pinvites-next,target=/app/.next/cache pnpm build

FROM node:${NODE_VERSION} AS runtime
ARG PNPM_VERSION
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PNPM_HOME=/pnpm
ENV PATH=${PNPM_HOME}:${PATH}
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV MEDIA_ROOT=/app/data/media
ENV HOME=/home/pinvites
WORKDIR /app

RUN apt-get update \
    && apt-get install --yes --no-install-recommends ca-certificates dumb-init openssl \
    && rm -rf /var/lib/apt/lists/* \
    && npm install --global "pnpm@${PNPM_VERSION}" \
    && groupadd --system --gid 1001 pinvites \
    && useradd --system --uid 1001 --gid pinvites --home-dir /home/pinvites --create-home pinvites \
    && mkdir -p /app/data/media \
    && chown -R pinvites:pinvites /app /home/pinvites

# The standalone server is small, while production dependencies remain
# available for `prisma migrate deploy` and the one-time admin bootstrap.
COPY --from=builder --chown=pinvites:pinvites /app/.next/standalone ./
COPY --from=builder --chown=pinvites:pinvites /app/.next/static ./.next/static
COPY --from=builder --chown=pinvites:pinvites /app/public ./public
COPY --from=production-dependencies --chown=pinvites:pinvites /app/node_modules ./node_modules
COPY --from=builder --chown=pinvites:pinvites /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=builder --chown=pinvites:pinvites /app/prisma ./prisma
COPY --from=builder --chown=pinvites:pinvites /app/prisma.config.ts /app/tsconfig.json ./
COPY --from=builder --chown=pinvites:pinvites /app/scripts ./scripts
COPY --from=builder --chown=pinvites:pinvites /app/src ./src
COPY --chown=pinvites:pinvites docker/entrypoint.sh /usr/local/bin/pinvites-entrypoint
RUN chmod 0555 /usr/local/bin/pinvites-entrypoint

USER pinvites
EXPOSE 3000
VOLUME ["/app/data/media"]
ENTRYPOINT ["dumb-init", "--", "pinvites-entrypoint"]
CMD ["node", "server.js"]
