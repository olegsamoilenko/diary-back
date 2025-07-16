from flask import Flask, request, jsonify
from sentence_transformers import SentenceTransformer
import numpy as np

model = SentenceTransformer('BAAI/bge-m3')
app = Flask(__name__)

@app.route("/embed", methods=["POST"])
def embed():
    data = request.get_json()
    text = data.get("text", "")
    instruction = data.get("instruction", None)
    input_text = f"[{instruction}] {text}" if instruction else text

    vector = model.encode(input_text)
    if isinstance(vector, (list, np.ndarray)) and hasattr(vector[0], "__len__"):
        vector = vector[0]
    return jsonify({"embedding": vector.tolist()})

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8567, debug=False)

