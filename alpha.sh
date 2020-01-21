#!/bin/bash

url="localhost:3003"

append()
{
  task="$@"
  curl --data-urlencode "task=$task" "$url/append" >/dev/null 2>&1
}

prepend()
{
  task="$@"
  curl --data-urlencode "task=$task" "$url/prepend" >/dev/null 2>&1
}

clear_all()
{
  curl -X POST "$url/clear" >/dev/null 2>&1
}

mark_done()
{
  curl -d taskNo=$1 "$url/done" >/dev/null 2>&1
}

mark_undone()
{
  curl -d taskNo=$1 "$url/undone" >/dev/null 2>&1
}

list()
{
  strikeThrough=`echo -e '\033[9;90m'`
  normal=`echo -e '\033[0m'`
  tasks=$(curl "$url/md" 2>/dev/null)
  while IFS= read -r line
  do
    echo -e $line | sed -e "s/~~/$strikeThrough/g" -e "s/$/$normal/g"
  done <<< "$tasks"
}

if [ $# -eq 0 ]
then
  list
elif [ "$1" = "--clear" ] || [ "$1" = "-c" ]
then
  clear_all
elif [ "$1" = "--done" ] || [ "$1" = "-d" ]
then
  mark_done $2
elif [ "$1" = "--undone" ] || [ "$1" = "-u" ]
then
  mark_undone $2
elif [ "$1" = "--prepend" ] || [ "$1" = "-p" ]
then
  prepend "${@:2}"
else
  append "$@"
fi
