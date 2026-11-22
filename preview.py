import argparse
import json
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import ProxyHandler, Request, build_opener
import webbrowser


ROBiMCUT = "http://127.0.0.1:7980"
DRAWING_MODULES = {"/preview/drawing-core.mjs", "/preview/robim-data-curves.mjs"}
MAX_NEST_BYTES = 50 * 1024 * 1024
LOCAL_HTTP = build_opener(ProxyHandler({}))


def rpc(method, params=None, request_id=None, headers=None):
    message = {"jsonrpc": "2.0", "method": method}
    if params is not None:
        message["params"] = params
    if request_id is not None:
        message["id"] = request_id
    request = Request(
        ROBiMCUT + "/mcp",
        data=json.dumps(message, ensure_ascii=False).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
            **(headers or {}),
        },
    )
    with LOCAL_HTTP.open(request, timeout=30) as response:
        if request_id is None:
            return None, response.headers
        if response.headers.get_content_type() == "text/event-stream":
            for line in response:
                if line.startswith(b"data:"):
                    reply = json.loads(line[5:])
                    if reply.get("id") == request_id:
                        break
            else:
                raise ValueError("MCP 未返回出图响应")
        else:
            reply = json.load(response)
        if "error" in reply:
            raise ValueError(reply["error"].get("message", "MCP 请求失败"))
        return reply["result"], response.headers


def generate_drawing(nest):
    info, response_headers = rpc("initialize", {
        "protocolVersion": "2025-03-26",
        "capabilities": {},
        "clientInfo": {"name": "webcam-preview", "version": "1.0"},
    }, 1)
    headers = {"MCP-Protocol-Version": info["protocolVersion"]}
    session_id = response_headers.get("Mcp-Session-Id")
    if session_id:
        headers["Mcp-Session-Id"] = session_id
    rpc("notifications/initialized", headers=headers)
    result, _ = rpc("tools/call", {
        "name": "generate_nest_drawing",
        "arguments": {"request": nest},
    }, 2, headers)
    texts = [item["text"] for item in result.get("content", []) if item.get("type") == "text"]
    if result.get("isError"):
        raise ValueError("\n".join(texts) or "RobimCut 出图失败")
    if not texts:
        raise ValueError("RobimCut 未返回展开几何")
    return json.loads(texts[0])


class PreviewHandler(SimpleHTTPRequestHandler):
    def send_body(self, status, body, content_type):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def send_json(self, status, data):
        self.send_body(status, json.dumps(data, ensure_ascii=False).encode("utf-8"),
                       "application/json; charset=utf-8")

    def do_GET(self):
        if self.path not in DRAWING_MODULES:
            return super().do_GET()
        filename = self.path.rsplit("/", 1)[-1]
        try:
            with LOCAL_HTTP.open(ROBiMCUT + "/_plugins/robim.nest-drawing/" + filename, timeout=10) as response:
                body = response.read()
        except (OSError, URLError):
            self.send_json(502, {"error": "无法读取 RobimCut 的 SVG 渲染模块"})
            return
        self.send_body(200, body, "text/javascript; charset=utf-8")

    def do_POST(self):
        if self.path != "/preview/nest-drawing":
            self.send_error(404)
            return
        if self.headers.get_content_type() != "application/json":
            self.send_json(415, {"error": "请提交 Nest JSON"})
            return
        origin = self.headers.get("Origin")
        if origin and origin != f"http://{self.headers.get('Host')}":
            self.send_json(403, {"error": "请从 WebCAM 本地预览页面提交"})
            return
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if not 0 < size <= MAX_NEST_BYTES:
                self.send_json(413, {"error": "单个 Nest 文件须小于或等于 50 MiB"})
                return
            nest = json.loads(self.rfile.read(size))
            if not isinstance(nest, dict):
                raise ValueError("Nest 必须是 JSON 对象")
        except ValueError as error:
            self.send_json(400, {"error": str(error)})
            return
        try:
            drawing = generate_drawing(nest)
        except HTTPError as error:
            self.send_json(502, {"error": f"RobimCut MCP 返回 HTTP {error.code}"})
            return
        except (OSError, URLError):
            self.send_json(502, {"error": "无法连接本机 RobimCut MCP（127.0.0.1:7980），或等待出图超时"})
            return
        except (ValueError, KeyError) as error:
            self.send_json(502, {"error": str(error)})
            return
        self.send_json(200, drawing)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=0)
    parser.add_argument("--no-browser", action="store_true")
    args = parser.parse_args()
    handler = partial(PreviewHandler, directory=Path(__file__).resolve().parent)
    with ThreadingHTTPServer(("127.0.0.1", args.port), handler) as server:
        url = f"http://127.0.0.1:{server.server_port}/"
        print(f"WebCAM local preview: {url}", flush=True)
        print("Keep this window open while viewing. Press Ctrl+C to stop.", flush=True)
        if not args.no_browser:
            webbrowser.open(url)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
