#include <stdio.h>
#include <execinfo.h>
#include <signal.h>
#include <unistd.h>
#include <stdlib.h>
#include <string.h>

#include "interpreter2.h"

#include <stdio.h>
#include <stdlib.h>

typedef struct
{
  const char *start;
  const char *end;
} char_range_t;

// Function to read an entire text file into a dynamically allocated string
char_range_t *readFileToString(const char *filename)
{
  // Open the file in read mode
  FILE *file = fopen(filename, "r");
  if (file == NULL)
  {
    perror("Error opening file");
    return NULL;
  }

  // Seek to the end of the file to determine its size
  if (fseek(file, 0, SEEK_END) != 0)
  {
    perror("Error seeking in file");
    fclose(file);
    return NULL;
  }

  // Get the file size
  long fileSize = ftell(file);
  if (fileSize == -1)
  {
    perror("Error getting file size");
    fclose(file);
    return NULL;
  }

  // Allocate memory for the file contents plus the null terminator
  char *buffer = (char *)malloc(fileSize + 1);
  if (buffer == NULL)
  {
    perror("Error allocating memory");
    fclose(file);
    return NULL;
  }

  // Rewind the file and read its contents
  rewind(file);
  size_t bytesRead = fread(buffer, 1, fileSize, file);
  if (bytesRead != fileSize)
  {
    perror("Error reading file");
    free(buffer);
    fclose(file);
    return NULL;
  }

  // Null-terminate the string
  buffer[bytesRead] = '\0';

  // Close the file and return the buffer
  fclose(file);
  char_range_t *range = malloc(sizeof(char_range_t));
  range->start = buffer;
  range->end = buffer + bytesRead;
  return range;
}

void handler(int sig)
{
  void *array[10];
  size_t size;

  // get void*'s for all entries on the stack
  size = backtrace(array, 10);

  // print out all the frames to stderr
  fprintf(stderr, "Error: signal %d:\n", sig);
  backtrace_symbols_fd(array, size, STDERR_FILENO);
  exit(1);
}

#define CHUNK_SIZE 1024 // Define the size of chunks to read at a time

char_range_t *readStdinToRange()
{

  char *buffer = NULL;
  size_t size = 0;   // Total size of the buffer
  size_t length = 0; // Length of the string in the buffer
  char chunk[CHUNK_SIZE];

  while (fgets(chunk, CHUNK_SIZE, stdin))
  {
    size_t chunkLength = strlen(chunk);
    char *newBuffer = realloc(buffer, size + chunkLength + 1);
    if (newBuffer == NULL)
    {
      perror("Error reallocating memory");
      free(buffer);
      return NULL;
    }
    buffer = newBuffer;
    strcpy(buffer + length, chunk);
    length += chunkLength;
    size += chunkLength;
  }

  if (ferror(stdin))
  {
    perror("Error reading from file");
    free(buffer);
    return NULL;
  }

  char_range_t *range = malloc(sizeof(char_range_t));
  range->start = buffer;
  range->end = buffer + length;
  return range;
}

int main(int argc, char **argv)
{
  signal(SIGSEGV, handler); // install our handler

  const int initial_capacity = 128;
  binding_t *defBindings = malloc(sizeof(binding_t) * initial_capacity);
  def_env_t denv = (def_env_t){.size = 0, .capacity = initial_capacity, .bindings = defBindings};

  char_range_t *range;
  if (argc == 2)
  {
    range = readFileToString(argv[1]);
  }
  else
  {
    range = readStdinToRange();
  }

  const char *start = range->start;
  const char *end = range->end;
  const char **cur = &start;
  while (start < end)
  {
    const form_t *form = parse_one(cur, end);
    if (!form)
      break;
    print_form(form);
    rtval_t result = eval_top(&denv, form);
    form_free((form_t *)form);
    printf(" => ");
    print_rtval(&result);
    printf("\n");
  }
  free(defBindings);
  free((void *)range->start);
  free(range);
  return 0;
}
