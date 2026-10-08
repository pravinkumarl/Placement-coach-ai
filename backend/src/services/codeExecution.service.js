/**
 * Code execution service — Judge0-compatible provider.
 *
 * SECURITY MODEL
 *  - Student code NEVER runs on this server (no child_process, no eval, no
 *    Function). It is submitted to a sandboxed Judge0 instance instead.
 *  - Provider credentials (JUDGE0_API_URL / JUDGE0_API_KEY / JUDGE0_API_HOST)
 *    live only in the server environment and are never sent to the browser.
 *  - Source size, CPU time, wall time and memory are capped on every request.
 *
 * HARNESS MODEL
 *  - Questions define an entry function, parameter types and a return type.
 *  - Test cases describe stdin as one line per argument and a normalized
 *    expected output. The service generates a small per-language runner that
 *    parses stdin, calls the student's function and prints the result, so the
 *    browser only ever sees starter templates — never solutions or hidden tests.
 */
import env from '../config/env.js';

export const MAX_SOURCE_CHARS = 20000;
const CPU_TIME_LIMIT = 5; // seconds
const WALL_TIME_LIMIT = 15; // seconds
const MEMORY_LIMIT_KB = 131072; // 128 MB
const REQUEST_TIMEOUT_MS = 30000;

/** Languages mapped to stable Judge0 language ids (present in Judge0 CE). */
export const SUPPORTED_LANGUAGES = {
  python: { judge0: 71, label: 'Python 3.8', short: 'Python' },
  java: { judge0: 62, label: 'Java (OpenJDK 13)', short: 'Java' },
  cpp: { judge0: 54, label: 'C++ (GCC 9.2)', short: 'C++' },
  c: { judge0: 50, label: 'C (GCC 9.2)', short: 'C' },
  javascript: { judge0: 63, label: 'JavaScript (Node 12)', short: 'JavaScript' },
  csharp: { judge0: 51, label: 'C# (Mono 6.6)', short: 'C#' },
  go: { judge0: 60, label: 'Go 1.13', short: 'Go' },
  rust: { judge0: 73, label: 'Rust 1.40', short: 'Rust' },
  kotlin: { judge0: 78, label: 'Kotlin 1.3', short: 'Kotlin' },
};

export const LANGUAGE_KEYS = Object.keys(SUPPORTED_LANGUAGES);

export function normalizeOutput(value) {
  return String(value ?? '')
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.replace(/\s+$/, ''))
    .join('\n')
    .replace(/\n+$/, '')
    .trim();
}

function mapJudge0Status(status) {
  const id = status?.id;
  const description = String(status?.description || '');
  if (id === 3) return 'Accepted';
  if (id === 4) return 'Wrong Answer';
  if (id === 5) return 'Time Limit Exceeded';
  if (id === 6) return 'Compilation Error';
  if (id === 17) return 'Memory Limit Exceeded';
  if (id === 1 || id === 2 || id === 18 || id === 19) return 'In Queue';
  if (id >= 7 && id <= 16) return 'Runtime Error';
  if (/accepted/i.test(description)) return 'Accepted';
  return description || 'Internal Error';
}

/* ============================================================
   LANGUAGE HARNESS GENERATORS
   Each returns { prefix, suffix } appended around the student's
   source. Types: 'int' | 'int[]' | 'string' | 'bool' | 'tree'
   ============================================================ */

function needsTree(spec) {
  return (spec.paramTypes || []).includes('tree') || spec.returnType === 'tree';
}

const TREE_PYTHON_PREFIX = `
class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right

def _pc_build_tree(tokens):
    if not tokens or tokens[0] == "null":
        return None
    root = TreeNode(int(tokens[0]))
    queue = [root]
    i = 1
    while queue and i < len(tokens):
        node = queue.pop(0)
        if i < len(tokens) and tokens[i] != "null":
            node.left = TreeNode(int(tokens[i]))
            queue.append(node.left)
        i += 1
        if i < len(tokens) and tokens[i] != "null":
            node.right = TreeNode(int(tokens[i]))
            queue.append(node.right)
        i += 1
    return root
`;

const TREE_JS_PREFIX = `
function TreeNode(val, left, right) {
  this.val = val === undefined ? 0 : val;
  this.left = left === undefined ? null : left;
  this.right = right === undefined ? null : right;
}
function _pcBuildTree(tokens) {
  if (!tokens.length || tokens[0] === 'null') return null;
  var root = new TreeNode(parseInt(tokens[0], 10));
  var queue = [root];
  var i = 1;
  while (queue.length && i < tokens.length) {
    var node = queue.shift();
    if (i < tokens.length && tokens[i] !== 'null') {
      node.left = new TreeNode(parseInt(tokens[i], 10));
      queue.push(node.left);
    }
    i++;
    if (i < tokens.length && tokens[i] !== 'null') {
      node.right = new TreeNode(parseInt(tokens[i], 10));
      queue.push(node.right);
    }
    i++;
  }
  return root;
}
`;

const TREE_CPP_PREFIX = `
struct TreeNode {
    int val;
    TreeNode *left;
    TreeNode *right;
    TreeNode() : val(0), left(nullptr), right(nullptr) {}
    TreeNode(int x) : val(x), left(nullptr), right(nullptr) {}
    TreeNode(int x, TreeNode *left, TreeNode *right) : val(x), left(left), right(right) {}
};
static TreeNode* _pc_build_tree(const std::vector<std::string>& tok) {
    if (tok.empty() || tok[0] == "null") return nullptr;
    TreeNode* root = new TreeNode(std::atoi(tok[0].c_str()));
    std::queue<TreeNode*> q;
    q.push(root);
    size_t i = 1;
    while (!q.empty() && i < tok.size()) {
        TreeNode* node = q.front();
        q.pop();
        if (i < tok.size() && tok[i] != "null") {
            node->left = new TreeNode(std::atoi(tok[i].c_str()));
            q.push(node->left);
        }
        i++;
        if (i < tok.size() && tok[i] != "null") {
            node->right = new TreeNode(std::atoi(tok[i].c_str()));
            q.push(node->right);
        }
        i++;
    }
    return root;
}
`;

const TREE_JAVA_SUFFIX = `
class TreeNode {
    int val;
    TreeNode left;
    TreeNode right;
    TreeNode() {}
    TreeNode(int val) { this.val = val; }
    TreeNode(int val, TreeNode left, TreeNode right) {
        this.val = val;
        this.left = left;
        this.right = right;
    }
}
class Main {
    public static void main(String[] args) throws Exception {
        java.io.BufferedReader _br = new java.io.BufferedReader(new java.io.InputStreamReader(System.in));
        java.util.ArrayList<String> _raw = new java.util.ArrayList<>();
        String _line;
        while ((_line = _br.readLine()) != null) _raw.add(_line);
        while (_raw.size() < 16) _raw.add("");
        TreeNode _a0 = _buildTree(_raw.get(0).trim());
        Solution _s = new Solution();
        boolean _r = _s.isValidBST(_a0);
        System.out.println(_r ? "true" : "false");
    }
    static TreeNode _buildTree(String data) {
        if (data.isEmpty()) return null;
        String[] tok = data.split("\\\\s+");
        if (tok.length == 0 || tok[0].equals("null")) return null;
        TreeNode root = new TreeNode(Integer.parseInt(tok[0]));
        java.util.Queue<TreeNode> queue = new java.util.LinkedList<>();
        queue.add(root);
        int i = 1;
        while (!queue.isEmpty() && i < tok.length) {
            TreeNode node = queue.poll();
            if (i < tok.length && !tok[i].equals("null")) {
                node.left = new TreeNode(Integer.parseInt(tok[i]));
                queue.add(node.left);
            }
            i++;
            if (i < tok.length && !tok[i].equals("null")) {
                node.right = new TreeNode(Integer.parseInt(tok[i]));
                queue.add(node.right);
            }
            i++;
        }
        return root;
    }
}
`;

function pythonHarness(spec) {
  const reads = (spec.paramTypes || []).map((type, i) => {
    if (type === 'int[]') return `    _a${i} = [int(_x) for _x in _lines[${i}].split()]`;
    if (type === 'int') return `    _a${i} = int((_lines[${i}] or "0").strip() or "0")`;
    if (type === 'bool') return `    _a${i} = _lines[${i}].strip().lower() == "true"`;
    if (type === 'tree') return `    _a${i} = _pc_build_tree(_lines[${i}].split())`;
    return `    _a${i} = _lines[${i}]`;
  }).join('\n');
  const args = (spec.paramTypes || []).map((_, i) => `_a${i}`).join(', ');
  const call = `    _r = ${spec.entryFunction}(${args})`;

  let print;
  if (spec.returnType === 'int[]') print = `    print(" ".join(str(_x) for _x in _r))`;
  else if (spec.returnType === 'bool') print = `    print("true" if _r else "false")`;
  else if (spec.returnType === 'void') print = '';
  else print = `    print(_r)`;

  return {
    prefix: needsTree(spec) ? TREE_PYTHON_PREFIX : '',
    suffix: `

if __name__ == "__main__":
    import sys
    _lines = (sys.stdin.read().split("\\n") + [""] * 16)
${reads}
${call}
${print}
`,
  };
}

function javascriptHarness(spec) {
  const reads = (spec.paramTypes || []).map((type, i) => {
    if (type === 'int[]') {
      return `  var _a${i} = _line(${i}).trim() ? _line(${i}).trim().split(/\\s+/).map(Number) : [];`;
    }
    if (type === 'int') return `  var _a${i} = parseInt(_line(${i}).trim() || '0', 10);`;
    if (type === 'bool') return `  var _a${i} = _line(${i}).trim().toLowerCase() === 'true';`;
    if (type === 'tree') return `  var _a${i} = _pcBuildTree(_line(${i}).split(/\\s+/));`;
    return `  var _a${i} = _line(${i});`;
  }).join('\n');
  const args = (spec.paramTypes || []).map((_, i) => `_a${i}`).join(', ');
  const call = `  var _r = ${spec.entryFunction}(${args});`;

  let print;
  if (spec.returnType === 'int[]') print = `  console.log(Array.isArray(_r) ? _r.join(' ') : String(_r));`;
  else if (spec.returnType === 'bool') print = `  console.log(_r ? 'true' : 'false');`;
  else if (spec.returnType === 'void') print = '';
  else print = `  console.log(_r);`;

  return {
    prefix: needsTree(spec) ? TREE_JS_PREFIX : '',
    suffix: `

;(function () {
  var _lines = require('fs').readFileSync(0, 'utf8').split('\\n');
  function _line(i) { return _lines[i] === undefined ? '' : _lines[i]; }
${reads}
${call}
${print}
})();
`,
  };
}

function cppHarness(spec) {
  const reads = (spec.paramTypes || []).map((type, i) => {
    if (type === 'int[]') {
      return `  std::istringstream _ss${i}(_lines[${i}]);
  std::vector<int> _a${i};
  int _v${i};
  while (_ss${i} >> _v${i}) _a${i}.push_back(_v${i});`;
    }
    if (type === 'int') {
      return `  std::istringstream _ss${i}(_lines[${i}]);
  int _a${i} = 0;
  _ss${i} >> _a${i};`;
    }
    if (type === 'bool') return `  bool _a${i} = (_lines[${i}].find("true") != std::string::npos);`;
    if (type === 'tree') {
      return `  std::istringstream _ss${i}(_lines[${i}]);
  std::vector<std::string> _tok${i};
  std::string _t${i};
  while (_ss${i} >> _t${i}) _tok${i}.push_back(_t${i});
  TreeNode* _a${i} = _pc_build_tree(_tok${i});`;
    }
    return `  std::string _a${i} = _lines[${i}];`;
  }).join('\n');
  const args = (spec.paramTypes || []).map((_, i) => `_a${i}`).join(', ');
  const call = `  ${spec.returnType === 'void' ? '' : `${cppReturnType(spec.returnType)} _r = `}${spec.entryFunction}(${args});`;

  let print;
  if (spec.returnType === 'int[]') {
    print = `  for (size_t _i = 0; _i < _r.size(); ++_i) { if (_i) std::cout << ' '; std::cout << _r[_i]; }
  std::cout << std::endl;`;
  } else if (spec.returnType === 'bool') print = `  std::cout << (_r ? "true" : "false") << std::endl;`;
  else if (spec.returnType === 'void') print = '';
  else print = `  std::cout << _r << std::endl;`;

  const includes = `#include <iostream>
#include <sstream>
#include <string>
#include <vector>
#include <queue>
#include <cstdlib>`;

  return {
    prefix: (needsTree(spec) ? TREE_CPP_PREFIX : '') + '\n' + includes + '\n',
    suffix: `

int main() {
  std::vector<std::string> _lines;
  std::string _tmp;
  while (std::getline(std::cin, _tmp)) _lines.push_back(_tmp);
  while (_lines.size() < 16) _lines.push_back("");
${reads}
${call}
${print}
  return 0;
}
`,
  };
}

function cppReturnType(type) {
  if (type === 'int[]') return 'std::vector<int>';
  if (type === 'bool') return 'bool';
  if (type === 'string') return 'std::string';
  return 'int';
}

function javaHarness(spec) {
  const isTree = needsTree(spec);
  if (isTree) return { prefix: '', suffix: TREE_JAVA_SUFFIX };

  const reads = (spec.paramTypes || []).map((type, i) => {
    if (type === 'int[]') return `        int[] _a${i} = _parseIntArray(_raw.get(${i}));`;
    if (type === 'int') return `        int _a${i} = Integer.parseInt(_raw.get(${i}).trim().isEmpty() ? "0" : _raw.get(${i}).trim());`;
    if (type === 'bool') return `        boolean _a${i} = _raw.get(${i}).trim().equalsIgnoreCase("true");`;
    return `        String _a${i} = _raw.get(${i});`;
  }).join('\n');
  const args = (spec.paramTypes || []).map((_, i) => `_a${i}`).join(', ');
  const javaType = spec.returnType === 'int[]' ? 'int[]'
    : spec.returnType === 'bool' ? 'boolean'
      : spec.returnType === 'string' ? 'String'
        : spec.returnType === 'void' ? 'void'
          : 'int';
  const decl = javaType === 'void' ? '' : `${javaType} _r = `;
  const call = `        ${decl}_s.${spec.entryFunction}(${args});`;

  let print;
  if (spec.returnType === 'int[]') print = `        System.out.println(_join(_r));`;
  else if (spec.returnType === 'bool') print = `        System.out.println(_r ? "true" : "false");`;
  else if (spec.returnType === 'void') print = '';
  else print = `        System.out.println(_r);`;

  return {
    prefix: '',
    suffix: `

class Main {
    public static void main(String[] args) throws Exception {
        java.io.BufferedReader _br = new java.io.BufferedReader(new java.io.InputStreamReader(System.in));
        java.util.ArrayList<String> _raw = new java.util.ArrayList<>();
        String _line;
        while ((_line = _br.readLine()) != null) _raw.add(_line);
        while (_raw.size() < 16) _raw.add("");
${reads}
        Solution _s = new Solution();
${call}
${print}
    }
    static int[] _parseIntArray(String s) {
        s = s == null ? "" : s.trim();
        if (s.isEmpty()) return new int[0];
        String[] parts = s.split("\\\\s+");
        int[] out = new int[parts.length];
        for (int i = 0; i < parts.length; i++) out[i] = Integer.parseInt(parts[i]);
        return out;
    }
    static String _join(int[] a) {
        StringBuilder b = new StringBuilder();
        for (int i = 0; i < a.length; i++) { if (i > 0) b.append(' '); b.append(a[i]); }
        return b.toString();
    }
}
`,
  };
}

function cHarness(spec) {
  const reads = (spec.paramTypes || []).map((type, i) => {
    if (type === 'int[]') {
      return `  char _copy${i}[8192];
  strncpy(_copy${i}, _lines[${i}], 8191);
  _copy${i}[8191] = '\\0';
  int _a${i}[512];
  int _n${i} = 0;
  for (char* _tok = strtok(_copy${i}, " \\t\\r\\n"); _tok && _n${i} < 512; _tok = strtok(NULL, " \\t\\r\\n")) {
    _a${i}[_n${i}++] = atoi(_tok);
  }`;
    }
    if (type === 'int') return `  int _a${i} = atoi(_lines[${i}]);`;
    if (type === 'bool') return `  int _a${i} = (strncmp(_lines[${i}], "true", 4) == 0);`;
    return `  char* _a${i} = _lines[${i}];`;
  }).join('\n');

  const callArgs = [];
  (spec.paramTypes || []).forEach((type, i) => {
    if (type === 'int[]') {
      callArgs.push(`_a${i}`, `_n${i}`);
    } else {
      callArgs.push(`_a${i}`);
    }
  });
  if (spec.returnType === 'int[]') callArgs.push('&_rsz');
  const decl = spec.returnType === 'void' ? ''
    : spec.returnType === 'int[]' ? '  int _rsz = 0;\n  int* _r = '
      : spec.returnType === 'bool' ? '  int _r = '
        : '  int _r = ';
  const call = `${decl}${spec.entryFunction}(${callArgs.join(', ')});`;

  let print;
  if (spec.returnType === 'int[]') {
    print = `  for (int _i = 0; _i < _rsz; _i++) { if (_i) putchar(' '); printf("%d", _r[_i]); }
  putchar('\\n');`;
  } else if (spec.returnType === 'bool') print = `  printf("%s\\n", _r ? "true" : "false");`;
  else if (spec.returnType === 'void') print = '';
  else print = `  printf("%d\\n", _r);`;

  return {
    prefix: '',
    suffix: `

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

int main(void) {
  char _content[65536];
  size_t _len = fread(_content, 1, sizeof(_content) - 1, stdin);
  _content[_len] = '\\0';
  char* _lines[16];
  int _nlines = 0;
  char* _start = _content;
  for (char* _c = _content; *_c && _nlines < 16; _c++) {
    if (*_c == '\\n') { *_c = '\\0'; _lines[_nlines++] = _start; _start = _c + 1; }
  }
  if (_nlines < 16) _lines[_nlines++] = _start;
  while (_nlines < 16) _lines[_nlines++] = "";
${reads}
${call}
${print}
  return 0;
}
`,
  };
}

function csharpHarness(spec, sourceCode) {
  const reads = (spec.paramTypes || []).map((type, i) => {
    if (type === 'int[]') {
      return `    int[] _a${i} = _lines[${i}].Trim().Length == 0
        ? new int[0]
        : _lines[${i}].Trim().Split((char[])null, StringSplitOptions.RemoveEmptyEntries).Select(int.Parse).ToArray();`;
    }
    if (type === 'int') return `    int _a${i} = int.Parse(_lines[${i}].Trim().Length == 0 ? "0" : _lines[${i}].Trim());`;
    if (type === 'bool') return `    bool _a${i} = _lines[${i}].Trim().Equals("true", StringComparison.OrdinalIgnoreCase);`;
    return `    string _a${i} = _lines[${i}];`;
  }).join('\n');
  const args = (spec.paramTypes || []).map((_, i) => `_a${i}`).join(', ');
  const decl = spec.returnType === 'void' ? '' : 'var _r = ';
  const call = `    ${decl}_s.${spec.entryFunction}(${args});`;

  let print;
  if (spec.returnType === 'int[]') print = `    Console.WriteLine(string.Join(" ", _r));`;
  else if (spec.returnType === 'bool') print = `    Console.WriteLine(_r ? "true" : "false");`;
  else if (spec.returnType === 'void') print = '';
  else print = `    Console.WriteLine(_r);`;

  const usesLinq = (spec.paramTypes || []).includes('int[]');
  const needsSystemLinq = usesLinq && !/using\s+System\.Linq\s*;/.test(sourceCode);
  const prefix = `using System;${needsSystemLinq ? '\nusing System.Linq;' : ''}\n`;

  return {
    prefix,
    suffix: `

public class Runner {
    public static void Main(string[] args) {
        string _content = System.Console.In.ReadToEnd();
        string[] _lines = _content.Split('\\n');
        if (_lines.Length < 16) System.Array.Resize(ref _lines, 16);
        for (int _i = 0; _i < _lines.Length; _i++) if (_lines[_i] == null) _lines[_i] = "";
${reads}
        var _s = new Solution();
${call}
${print}
    }
}
`,
  };
}

function goHarness(spec) {
  const reads = (spec.paramTypes || []).map((type, i) => {
    if (type === 'int[]') {
      return `	_tokens${i} := strings.Fields(_lines[${i}])
	_a${i} := make([]int, 0, len(_tokens${i}))
	for _, _t := range _tokens${i} {
		_v, _ := strconv.Atoi(_t)
		_a${i} = append(_a${i}, _v)
	}`;
    }
    if (type === 'int') return `	_a${i}, _ := strconv.Atoi(strings.TrimSpace(_lines[${i}]))
	_ = _`;
    if (type === 'bool') return `	_a${i} := strings.TrimSpace(_lines[${i}]) == "true"`;
    return `	_a${i} := _lines[${i}]`;
  }).join('\n');
  const args = (spec.paramTypes || []).map((_, i) => `_a${i}`).join(', ');
  const call = spec.returnType === 'void'
    ? `	${spec.entryFunction}(${args})`
    : `	_r := ${spec.entryFunction}(${args})`;

  let print;
  if (spec.returnType === 'int[]') {
    print = `	_out := make([]string, 0, len(_r))
	for _, _v := range _r {
		_out = append(_out, strconv.Itoa(_v))
	}
	fmt.Println(strings.Join(_out, " "))`;
  } else if (spec.returnType === 'bool') print = `	fmt.Println(_r)`;
  else if (spec.returnType === 'void') print = `	_ = _r`;
  else print = `	fmt.Println(_r)`;
  if (spec.returnType === 'void') print = `	fmt.Println("done")`;

  return {
    prefix: '',
    suffix: `

var _ = []interface{}{fmt.Sprint, os.Stdin, bufio.NewReader, strconv.Itoa, strings.Join}

func main() {
	_scanner := bufio.NewScanner(os.Stdin)
	var _lines []string
	for _scanner.Scan() {
		_lines = append(_lines, _scanner.Text())
	}
	for len(_lines) < 16 {
		_lines = append(_lines, "")
	}
${reads}
${call}
${print}
}
`,
  };
}

function rustHarness(spec) {
  const reads = (spec.paramTypes || []).map((type, i) => {
    if (type === 'int[]') {
      return `    let _a${i}: Vec<i32> = _lines[${i}].split_whitespace().map(|_x| _x.parse::<i32>().unwrap_or(0)).collect();`;
    }
    if (type === 'int') return `    let _a${i}: i32 = _lines[${i}].trim().parse().unwrap_or(0);`;
    if (type === 'bool') return `    let _a${i}: bool = _lines[${i}].trim() == "true";`;
    return `    let _a${i}: String = _lines[${i}].to_string();`;
  }).join('\n');
  const args = (spec.paramTypes || []).map((_, i) => `_a${i}`).join(', ');
  const call = spec.returnType === 'void'
    ? `    ${spec.entryFunction}(${args});`
    : `    let _r = ${spec.entryFunction}(${args});`;

  let print;
  if (spec.returnType === 'int[]') {
    print = `    let _out: Vec<String> = _r.iter().map(|_x| _x.to_string()).collect();
    println!("{}", _out.join(" "));`;
  } else if (spec.returnType === 'bool') print = `    println!("{}", if _r { "true" } else { "false" });`;
  else if (spec.returnType === 'void') print = '';
  else print = `    println!("{}", _r);`;

  return {
    prefix: '',
    suffix: `

fn main() {
    use std::io::Read;
    let mut _buf = String::new();
    std::io::stdin().read_to_string(&mut _buf).unwrap();
    let mut _lines: Vec<&str> = _buf.lines().collect();
    while _lines.len() < 16 {
        _lines.push("");
    }
${reads}
${call}
${print}
}
`,
  };
}

function kotlinHarness(spec) {
  const reads = (spec.paramTypes || []).map((type, i) => {
    if (type === 'int[]') {
      return `    val _a${i} = _lines[${i}].trim().split(Regex("\\\\s+")).filter { it.isNotEmpty() }.map { it.toInt() }.toIntArray()`;
    }
    if (type === 'int') return `    val _a${i} = if (_lines[${i}].trim().isEmpty()) 0 else _lines[${i}].trim().toInt()`;
    if (type === 'bool') return `    val _a${i} = _lines[${i}].trim().equals("true", ignoreCase = true)`;
    return `    val _a${i} = _lines[${i}]`;
  }).join('\n');
  const args = (spec.paramTypes || []).map((_, i) => `_a${i}`).join(', ');
  const call = spec.returnType === 'void'
    ? `    ${spec.entryFunction}(${args})`
    : `    val _r = ${spec.entryFunction}(${args})`;

  let print;
  if (spec.returnType === 'int[]') print = `    println(_r.joinToString(" "))`;
  else if (spec.returnType === 'bool') print = `    println(if (_r) "true" else "false")`;
  else if (spec.returnType === 'void') print = `    println("done")`;
  else print = `    println(_r)`;

  return {
    prefix: '',
    suffix: `

fun main() {
    val _lines = generateSequence { readLine() }.toMutableList()
    while (_lines.size < 16) _lines.add("")
${reads}
${call}
${print}
}
`,
  };
}

const HARNESS_BUILDERS = {
  python: pythonHarness,
  javascript: javascriptHarness,
  cpp: cppHarness,
  java: javaHarness,
  c: cHarness,
  csharp: csharpHarness,
  go: goHarness,
  rust: rustHarness,
  kotlin: kotlinHarness,
};

/**
 * Build the full program sent to the judge (student source + generated runner).
 * Never called on the Node server itself.
 */
export function buildProgram(question, language, sourceCode) {
  const spec = {
    entryFunction: question.entryFunction,
    paramTypes: question.paramTypes || [],
    returnType: question.returnType || 'void',
  };
  if (!spec.entryFunction || !Array.isArray(spec.paramTypes) || spec.paramTypes.length === 0) {
    const err = new Error('This question is not configured for code execution.');
    err.code = 'QUESTION_NOT_EXECUTABLE';
    throw err;
  }
  const build = HARNESS_BUILDERS[language];
  if (!build) {
    const err = new Error(`Language '${language}' is not supported.`);
    err.code = 'UNSUPPORTED_LANGUAGE';
    throw err;
  }
  const { prefix, suffix } = build(spec, sourceCode);
  return `${prefix || ''}${sourceCode}\n${suffix || ''}`;
}

/**
 * Execute a program on the Judge0-compatible provider.
 * @returns {Promise<{status, statusCode, stdout, stderr, compileOutput, time, memory, exitCode}>}
 */
export async function executeCode({ language, sourceCode, stdin = '' }) {
  const languageDef = SUPPORTED_LANGUAGES[language];
  if (!languageDef) {
    const err = new Error(`Language '${language}' is not supported.`);
    err.code = 'UNSUPPORTED_LANGUAGE';
    throw err;
  }

  const headers = { 'Content-Type': 'application/json' };
  if (env.judge0ApiKey) {
    headers['X-RapidAPI-Key'] = env.judge0ApiKey;
    headers['X-RapidAPI-Host'] = env.judge0ApiHost || new URL(env.judge0ApiUrl).host;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(
      `${env.judge0ApiUrl}/submissions?base64_encoded=false&wait=true`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          source_code: sourceCode,
          language_id: languageDef.judge0,
          stdin: String(stdin || ''),
          cpu_time_limit: CPU_TIME_LIMIT,
          wall_time_limit: WALL_TIME_LIMIT,
          memory_limit: MEMORY_LIMIT_KB,
        }),
        signal: controller.signal,
      }
    );
  } catch (error) {
    const err = new Error(
      error.name === 'AbortError'
        ? 'The code execution service timed out. Please try again.'
        : 'The code execution service is unavailable. Please try again shortly.'
    );
    err.code = 'EXECUTION_UNAVAILABLE';
    err.cause = error;
    throw err;
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const err = new Error('The code execution service rejected the request. Please try again shortly.');
    err.code = 'EXECUTION_UNAVAILABLE';
    err.detail = response.status;
    throw err;
  }

  const data = await response.json();
  return {
    status: mapJudge0Status(data.status),
    statusCode: data.status?.id ?? 0,
    stdout: data.stdout ?? '',
    stderr: data.stderr ?? '',
    compileOutput: data.compile_output ?? '',
    time: data.time ?? null,
    memory: data.memory ?? null,
    exitCode: data.exit_code ?? null,
    message: data.message ?? '',
  };
}

/**
 * Run a question's test cases against a submission.
 * @returns {Promise<{status, passedTests, totalTests, score, results, time, memory, compileOutput, stderr}>}
 */
export async function runTestCases(question, language, sourceCode, testCases) {
  const results = [];
  let compileOutput = '';
  let firstStderr = '';
  let totalTime = 0;
  let peakMemory = null;
  let status = 'Accepted';

  for (const testCase of testCases) {
    const record = {
      passed: false,
      status: 'Internal Error',
      input: testCase.input ?? '',
      actualOutput: '',
      expectedOutput: normalizeOutput(testCase.expectedOutput),
      time: null,
      memory: null,
      stderr: '',
      compileOutput: '',
    };

    let program;
    try {
      program = buildProgram(question, language, sourceCode);
    } catch (error) {
      record.status = 'Internal Error';
      record.stderr = error.message;
      results.push(record);
      status = 'Internal Error';
      break;
    }

    let outcome;
    try {
      outcome = await executeCode({ language, sourceCode: program, stdin: testCase.input ?? '' });
    } catch (error) {
      // Provider outage — surface a clean service error instead of a score.
      error.testResults = results;
      throw error;
    }

    record.actualOutput = normalizeOutput(outcome.stdout);
    record.stderr = outcome.stderr || '';
    record.compileOutput = outcome.compileOutput || '';
    record.status = outcome.status;
    record.time = outcome.time;
    record.memory = outcome.memory;
    if (typeof outcome.time === 'number') totalTime += outcome.time;
    if (typeof outcome.memory === 'number') {
      peakMemory = peakMemory === null ? outcome.memory : Math.max(peakMemory, outcome.memory);
    }

    if (outcome.status === 'Accepted') {
      record.passed = record.actualOutput === record.expectedOutput;
      if (!record.passed) record.status = 'Wrong Answer';
    } else if (outcome.status !== 'Accepted' && outcome.compileOutput && !compileOutput) {
      compileOutput = outcome.compileOutput;
    } else if (record.stderr && !firstStderr) {
      firstStderr = record.stderr;
    }

    results.push(record);

    if (outcome.status === 'Compilation Error') {
      status = 'Compilation Error';
      break; // every case would fail the same way
    }
    if (record.passed === false && status === 'Accepted') {
      status = record.status;
    }
  }

  const passedTests = results.filter((r) => r.passed).length;
  const totalTests = testCases.length;
  const score = totalTests ? Math.round((passedTests / totalTests) * 100) : 0;

  return {
    status,
    passedTests,
    totalTests,
    score,
    results,
    executionTime: Math.round(totalTime * 1000) / 1000,
    memory: peakMemory,
    compileOutput,
    stderr: firstStderr,
  };
}

export default {
  SUPPORTED_LANGUAGES,
  LANGUAGE_KEYS,
  MAX_SOURCE_CHARS,
  buildProgram,
  executeCode,
  runTestCases,
  normalizeOutput,
};
