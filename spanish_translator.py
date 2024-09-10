import pandas as pd
from deep_translator import GoogleTranslator
import time
from tqdm import tqdm
import logging
import os
from concurrent.futures import ThreadPoolExecutor, as_completed

# Set up logging
logging.basicConfig(filename='spanish_translation_log.txt', level=logging.INFO,
                    format='%(asctime)s - %(levelname)s - %(message)s')

# Load the CSV file
file_path = 'spanish_news_articles_with_ilr7192024.csv'  # Update this to your Spanish CSV file path
output_file_path = 'translation_spanish_news07192024.csv'
checkpoint_file = 'spanish_translation_checkpoint.csv'

# Check if checkpoint exists
if os.path.exists(checkpoint_file):
    df = pd.read_csv(checkpoint_file)
    logging.info(f"Resuming from checkpoint: {checkpoint_file}")
else:
    df = pd.read_csv(file_path)
    logging.info(f"Starting new translation job: {file_path}")

# Ensure 'translated_summary' column exists
if 'translated_summary' not in df.columns:
    df['translated_summary'] = pd.NA
    logging.info("Created 'translated_summary' column")

# Initialize the translators
google_translator = GoogleTranslator(source='es', target='en')
mymemory_translator = MyMemoryTranslator(source='spanish', target='english')

def translate_with_backoff(text, translator, max_retries=5):
    for attempt in range(max_retries):
        try:
            return translator.translate(text)
        except Exception as e:
            logging.error(f"Translation attempt {attempt + 1} failed: {e}")
            if attempt == max_retries - 1:
                return f"Translation failed: {e}"
            time.sleep(2 ** attempt)  # Exponential backoff
    return "Translation failed after maximum retries"

def translate_text(text, index):
    if pd.isna(text) or text == '':
        return ''
    try:
        result = translate_with_backoff(text, google_translator)
        if result.startswith("Translation failed"):
            logging.warning(f"Google Translate failed for index {index}. Trying MyMemory Translator.")
            result = translate_with_backoff(text, mymemory_translator)
        return result
    except requests.exceptions.RequestException as e:
        logging.error(f"Network error at index {index}: {e}")
        return f"Network error: {e}"
    except Exception as e:
        logging.error(f"Unexpected error at index {index}: {e}")
        return f"Unexpected error: {e}"

def truncate_text(text, max_length=150):
    if len(text) <= max_length:
        return text
    return text[:max_length].rsplit(' ', 1)[0] + '...'

# Create a progress bar
pbar = tqdm(total=len(df), desc="Translating")

# Process rows one by one
for index, row in df.iterrows():
    if pd.isna(row['translated_summary']):
        original_text = truncate_text(str(row['summary']), 150)
        translated_text = translate_text(original_text, index)
        df.at[index, 'translated_summary'] = truncate_text(translated_text, 150)

        # Save checkpoint every 10 rows
        if index % 10 == 0:
            df.to_csv(checkpoint_file, index=False)
            logging.info(f"Checkpoint saved at row {index}")

        # Print detailed progress
        print(f"\nProcessed row {index}:")
        print(f"Original: {original_text}")
        print(f"Translated: {df.at[index, 'translated_summary']}")

    pbar.update(1)

    # Add a small delay to avoid rate limiting
    time.sleep(1)

pbar.close()

# Save the final result
df.to_csv(output_file_path, index=False)
logging.info(f"Translation job completed. Results saved to {output_file_path}")

# Print statistics
total_articles = len(df)
successful_translations = df['translated_summary'].notna().sum()
failed_translations = df['translated_summary'].str.startswith(("Translation failed", "Network error", "Unexpected error"), na=False).sum()

print(f"\nTranslation Statistics:")
print(f"Total articles: {total_articles}")
print(f"Successful translations: {successful_translations}")
print(f"Failed translations: {failed_translations}")
print(f"Success rate: {successful_translations / total_articles:.2%}")

logging.info(f"Translation completed. Total: {total_articles}, Successful: {successful_translations}, Failed: {failed_translations}")
