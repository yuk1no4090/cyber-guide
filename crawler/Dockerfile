FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
ENV SCRAPY_SETTINGS_MODULE=cyberguide_crawler.settings
CMD ["python", "run.py"]
