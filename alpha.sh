#!/bin/bash

url="localhost:3003"

append()
{
  task="$@"
  curl --data-urlencode "task=$task" $url/append >/dev/null 2>&1
}

prepend()
{
  task="$@"
  curl --data-urlencode "task=$task" $url/prepend >/dev/null 2>&1
}

delete()
{
  curl -d taskNo=$1 -X DELETE $url >/dev/null 2>&1
}

list()
{
  tasks=$(curl $url/list 2>/dev/null)
  echo -e "$tasks"
}

if [ $# -eq 0 ]
then
  list
elif [ "$1" = "--delete" ]
then
  delete $2
elif [ "$1" = "--prepend" ]
then
  prepend "${@:2}"
else
  append "$@"
fi
