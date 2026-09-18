from pathlib import Path
import sys, zipfile
source=Path(sys.argv[1]).resolve()
destination=Path(sys.argv[2]).resolve()
with zipfile.ZipFile(destination,'x',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as archive:
    for path in sorted(source.rglob('*')):
        if path.is_symlink():
            raise ValueError('Package links not allowed')
        if path.is_file():
            archive.write(path,path.relative_to(source).as_posix())
