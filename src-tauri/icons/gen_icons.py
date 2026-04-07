import struct, zlib

def create_png(width, height, filename):
    def chunk(ctype, data):
        c = ctype + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)
    sig = b'\x89PNG\r\n\x1a\n'
    ihdr = chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0))
    raw = b''
    for y in range(height):
        raw += b'\x00'
        for x in range(width):
            raw += b'\x1a\x1a\x2e\xff'
    idat = chunk(b'IDAT', zlib.compress(raw))
    iend = chunk(b'IEND', b'')
    with open(filename, 'wb') as f:
        f.write(sig + ihdr + idat + iend)

create_png(32, 32, '32x32.png')
create_png(128, 128, '128x128.png')
create_png(256, 256, '128x128@2x.png')

# Create minimal ICO (just a 32x32 wrapped in ICO header)
with open('32x32.png', 'rb') as f:
    png_data = f.read()

ico_header = struct.pack('<HHH', 0, 1, 1)  # reserved, type=ICO, count=1
ico_entry = struct.pack('<BBBBHHII', 32, 32, 0, 0, 1, 32, len(png_data), 22)
with open('icon.ico', 'wb') as f:
    f.write(ico_header + ico_entry + png_data)

# Create minimal ICNS (just header + ic07 = 128x128 PNG)
with open('128x128.png', 'rb') as f:
    png128 = f.read()

icns_type = b'ic07'
icns_atom = icns_type + struct.pack('>I', len(png128) + 8) + png128
icns_header = b'icns' + struct.pack('>I', len(icns_atom) + 8)
with open('icon.icns', 'wb') as f:
    f.write(icns_header + icns_atom)

print('All icons created')
