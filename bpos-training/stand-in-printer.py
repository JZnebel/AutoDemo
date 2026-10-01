"""
A stand-in network printer for filming: accepts raw print jobs (ESC/POS, ZPL) on a TCP
port and appends them to a file, so a clip can show the real Printer Bridge working and
the take can check the job actually arrived.

    python3 bpos-training/stand-in-printer.py <port> <outfile>
"""
import socket, sys, threading

port, out = int(sys.argv[1]), sys.argv[2]
srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
srv.bind(("127.0.0.1", port))
srv.listen(8)


def handle(conn):
    chunks = []
    conn.settimeout(3)
    try:
        while True:
            b = conn.recv(65536)
            if not b:
                break
            chunks.append(b)
    except socket.timeout:
        pass
    finally:
        conn.close()
    if chunks:
        with open(out, "ab") as f:
            f.write(b"".join(chunks))


while True:
    c, _ = srv.accept()
    threading.Thread(target=handle, args=(c,), daemon=True).start()
