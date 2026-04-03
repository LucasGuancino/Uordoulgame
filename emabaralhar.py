import random

with open('PalavrasTermo.txt', 'r', encoding='utf-8') as f:
    palavras = f.readlines()

random.shuffle(palavras)

with open('PalavrasTermo.txt', 'w', encoding='utf-8') as f:
    f.writelines(palavras)

print("Arquivo embaralhado com sucesso!")