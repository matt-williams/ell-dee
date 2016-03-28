filename=$1
convert $1 \
        -crop 1x8 \
        -swap 1,8 -swap 2,16 -swap 3,24 -swap 4,32 -swap 5,40 -swap 6,48 -swap 7,56 \
        -swap 10,17 -swap 11,25 -swap 12,33 -swap 13,41 -swap 14,49 -swap 15,57 \
        -swap 19,26 -swap 20,34 -swap 21,42 -swap 22,50 -swap 23,58 \
        -swap 28,35 -swap 29,43 -swap 30,51 -swap 31,59 \
        -swap 37,44 -swap 38,52 -swap 39,60 \
        -swap 46,53 -swap 47,61 \
        -swap 55,62 \
        +append \
        $1.rotated
