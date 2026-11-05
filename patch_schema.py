import re

with open("prisma/schema.prisma", "r") as f:
    schema = f.read()

# Make sure PortalType enum exists at the top with other enums if not there
if "enum PortalType {" not in schema:
    schema = schema + "\nenum PortalType {\n  ADMIN\n  MINIAPP\n  WEB\n}\n"

with open("prisma/schema.prisma", "w") as f:
    f.write(schema)
