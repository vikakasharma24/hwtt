import os
import shutil
import subprocess

print("=================================================================")
print(">> FIXING MYSQL WORKBENCH CONFIGURATION & SETTINGS")
print("=================================================================")

# 1. Terminate Workbench if running so changes are not overwritten
try:
    subprocess.run(["powershell", "-Command", "Stop-Process -Name MySQLWorkbench -Force -ErrorAction SilentlyContinue"], check=False)
    print("[1] Ensured MySQLWorkbench process is stopped.")
except Exception as e:
    print(f"[!] Warning stopping workbench: {e}")

wb_dir = os.path.expandvars(r"%APPDATA%\MySQL\Workbench")
os.makedirs(wb_dir, exist_ok=True)

# 2. Prepare clean connections.xml
# Note: NO SQL_MODE, NO empty key, useSSL=0, schema=jh_health_db
conn_id = "{5C2FB6E3-5EB1-42AD-A493-FCD148222308}"
owner_id = "{E78486D3-F55F-43A3-B778-D8D387B80FD4}"

clean_connections = f"""<?xml version="1.0"?>
<data grt_format="2.0">
  <value _ptr_="000001542410F110" type="list" content-type="object" content-struct-name="db.mgmt.Connection">
    <value type="object" struct-name="db.mgmt.Connection" id="{conn_id}" struct-checksum="0x96ba47d8">
      <link type="object" struct-name="db.mgmt.Driver" key="driver">com.mysql.rdbms.mysql.driver.native</link>
      <value type="string" key="hostIdentifier">Mysql@localhost:3306</value>
      <value type="int" key="isDefault">1</value>
      <value _ptr_="0000015424636720" type="dict" key="modules"/>
      <value _ptr_="0000015424636A80" type="dict" key="parameterValues">
        <value type="string" key="hostName">localhost</value>
        <value type="int" key="lastConnected">1791190994</value>
        <value type="string" key="password"></value>
        <value type="int" key="port">3306</value>
        <value type="string" key="schema">jh_health_db</value>
        <value type="string" key="serverVersion">8.0.46</value>
        <value type="string" key="sslCA"></value>
        <value type="string" key="sslCert"></value>
        <value type="string" key="sslCipher"></value>
        <value type="string" key="sslKey"></value>
        <value type="int" key="useSSL">0</value>
        <value type="string" key="userName">root</value>
      </value>
      <value type="string" key="name">Local instance MySQL80</value>
      <link type="object" struct-name="GrtObject" key="owner">{owner_id}</link>
    </value>
  </value>
</data>
"""

conn_path = os.path.join(wb_dir, "connections.xml")
if os.path.exists(conn_path):
    shutil.copyfile(conn_path, conn_path + ".bak")

with open(conn_path, "w", encoding="utf-8") as f:
    f.write(clean_connections)
print(f"[2] Wrote clean connections.xml to {conn_path}")

# 3. Clean server_instances.xml
server_inst_path = os.path.join(wb_dir, "server_instances.xml")
clean_server_instances = f"""<?xml version="1.0"?>
<data grt_format="2.0">
  <value _ptr_="0000016B6B37D630" type="list" content-type="object" content-struct-name="db.mgmt.ServerInstance">
    <value type="object" struct-name="db.mgmt.ServerInstance" id="{{9159C5FE-1F50-4F8C-871F-B264ACB2DD44}}" struct-checksum="0x367436e2">
      <link type="object" struct-name="db.mgmt.Connection" key="connection">{conn_id}</link>
      <value _ptr_="0000016B6B4E7EB0" type="dict" key="loginInfo">
        <value type="string" key="ssh.port">22</value>
        <value type="int" key="ssh.useKey">0</value>
        <value type="string" key="wmi.hostName">localhost</value>
        <value type="string" key="wmi.userName"></value>
      </value>
      <value _ptr_="0000016B6B4E7670" type="dict" key="serverInfo">
        <value type="string" key="serverVersion">8.0.46</value>
        <value type="int" key="setupPending">0</value>
        <value type="string" key="sys.config.path">C:\\ProgramData\\MySQL\\MySQL Server 8.0\\my.ini</value>
        <value type="string" key="sys.config.section">mysqld</value>
        <value type="string" key="sys.mysqld.service_name">MySQL80</value>
        <value type="string" key="sys.preset"></value>
        <value type="string" key="sys.sudo"></value>
        <value type="string" key="sys.system">Windows</value>
        <value type="int" key="windowsAdmin">1</value>
      </value>
      <value type="string" key="name">Local instance MySQL80</value>
    </value>
  </value>
</data>
"""

with open(server_inst_path, "w", encoding="utf-8") as f:
    f.write(clean_server_instances)
print(f"[3] Wrote clean server_instances.xml to {server_inst_path}")

# 4. Clean and configure sql_workspaces
ws_dir = os.path.join(wb_dir, "sql_workspaces")
if os.path.exists(ws_dir):
    # Remove old duplicate workspace if exists
    dup_ws = os.path.join(ws_dir, "jh_health_db-1.workspace")
    if os.path.exists(dup_ws):
        try:
            shutil.rmtree(dup_ws)
            print(f"[4] Removed stale workspace {dup_ws}")
        except Exception:
            pass

    # Update Local_instance_MySQL80-1.workspace
    local_ws = os.path.join(ws_dir, "Local_instance_MySQL80-1.workspace")
    if os.path.exists(local_ws):
        schema_tree_p = os.path.join(local_ws, "schema_tree")
        with open(schema_tree_p, "w", encoding="utf-8") as f:
            f.write("active_schema=jh_health_db\nexpanded=jh_health_db:schema,tables\n")
        
        # Replace kobo_data with jh_health_db in scratch files
        for fname in os.listdir(local_ws):
            if fname.endswith(".scratch"):
                sf = os.path.join(local_ws, fname)
                try:
                    with open(sf, "r", encoding="utf-8", errors="ignore") as r:
                        content = r.read()
                    if "kobo_data" in content:
                        new_content = content.replace("kobo_data", "jh_health_db")
                        with open(sf, "w", encoding="utf-8") as w:
                            w.write(new_content)
                except Exception:
                    pass
        print(f"[5] Updated workspace {local_ws} to focus on jh_health_db.")

print("=================================================================")
print(">> WORKBENCH CONFIGURATION REPAIR COMPLETE!")
print("=================================================================")
