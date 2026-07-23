FROM node:22.22.0-alpine3.23@sha256:e4bf2a82ad0a4037d28035ae71529873c069b13eb0455466ae0bc13363826e34 AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@11.11.0 --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

FROM alpine:3.23@sha256:fd791d74b68913cbb027c6546007b3f0d3bc45125f797758156952bc2d6daf40

ARG PB_VERSION=0.39.9
ARG PB_SHA256=4c5a1aced62ebf658bfbcfeaa944c4bfa88b173dd9d598d3cab55ea63587b36b

RUN apk add --no-cache ca-certificates unzip wget \
	&& wget --quiet \
		"https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip" \
		--output-document /tmp/pocketbase.zip \
	&& echo "${PB_SHA256}  /tmp/pocketbase.zip" | sha256sum -c \
	&& mkdir -p /pb/pb_data /pb/pb_public \
	&& unzip /tmp/pocketbase.zip -d /pb \
	&& rm /tmp/pocketbase.zip \
	&& addgroup --system --gid 10001 vega \
	&& adduser --system --disabled-password --uid 10001 --ingroup vega --home /pb vega \
	&& chown -R vega:vega /pb

COPY --from=builder --chown=vega:vega /app/build/ /pb/pb_public/

USER vega
WORKDIR /pb

EXPOSE 8090

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
	CMD wget --quiet --spider http://127.0.0.1:8090/api/health || exit 1

ENTRYPOINT ["/pb/pocketbase"]
CMD ["serve", "--http=0.0.0.0:8090", "--dir=/pb/pb_data", "--publicDir=/pb/pb_public"]
