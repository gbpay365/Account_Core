# ── Stage 1: Build ──────────────────────────────────────────────────────────
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

# Copy project file and restore dependencies
COPY ComptabiliteAPI.csproj .
RUN dotnet restore

# Copy all source files and build
COPY . .
RUN dotnet publish -c Release -o /app/publish --no-restore

# ── Stage 2: Runtime ─────────────────────────────────────────────────────────
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app

# Install required libs for QuestPDF rendering
RUN apt-get update && apt-get install -y --no-install-recommends \
    libfontconfig1 libgdiplus \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/publish .

# Configure ports
EXPOSE 8080
ENV ASPNETCORE_URLS=http://+:8080
ENV ASPNETCORE_ENVIRONMENT=Production

ENTRYPOINT ["dotnet", "ComptabiliteAPI.dll"]
