# syntax=docker/dockerfile:1.7
# Calculadora RTC (Receita Federal/Serpro) — usada SEM modificação.
# O código-fonte vem do contexto adicional "calculadora" (../calculadora-rtc-regime-regular),
# definido no docker-compose.yml (additional_contexts).

# ---------- Etapa 1: banco SQLite (Flyway) + build do JAR ----------
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /src
COPY --from=calculadora pom.xml ./
# Cache das dependências Maven (acelera rebuilds)
RUN --mount=type=cache,target=/root/.m2 mvn -q -B dependency:go-offline || true
COPY --from=calculadora src ./src
COPY --from=calculadora flyway ./flyway

# Gera calculadora/db/calculadora-pro.db (mesmo comando do README oficial)
RUN --mount=type=cache,target=/root/.m2 \
    mkdir -p calculadora/db && \
    mvn -B flyway:migrate -Dflyway.configFiles=flyway/flyway-pro.conf

# Empacota sem rodar testes (os testes oficiais rodam no repositório da Receita)
RUN --mount=type=cache,target=/root/.m2 \
    mvn -B -DskipTests package && \
    cp target/api-regime-geral.jar /src/app.jar

# ---------- Etapa 2: runtime ----------
FROM eclipse-temurin:21-jre
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 10001 calc
WORKDIR /app
COPY --from=build /src/app.jar ./app.jar
# O perfil offline lê ./calculadora/db/calculadora-pro.db (somente leitura)
COPY --from=build /src/calculadora/db ./calculadora/db
RUN chown -R calc /app
USER calc

ENV SPRING_PROFILES_ACTIVE=offline \
    JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=75"
EXPOSE 8080 9101
HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=5 \
  CMD curl -fs http://localhost:9101/health || exit 1
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
