pipeline {
    agent any
    environment {
        PYTHON_PATH = '/Library/Frameworks/Python.framework/Versions/3.12/bin/python3'
        VENV_DIR = 'virtual_env'
        VENV_BIN = "${VENV_DIR}/bin"
    }
    stages {

        stage('Setup') {
            steps {
                script {
                    sh "${PYTHON_PATH} -m venv ${VENV_DIR}"
                    sh "source ${VENV_BIN}/activate && ${VENV_BIN}/python3.12 --version"
                    sh "which ${VENV_BIN}/python3.12"
                    sh "${VENV_BIN}/pip3 --version"
                    sh "which ${VENV_BIN}/pip3"
                    sh "${VENV_BIN}/pip3 install -r requirements.txt"
                    sh "${VENV_BIN}/python3.12 tracker.py"
                }
            }
        }

        stage('Push to origin') {
            steps {
                script {
                    sh '''git add -f products.csv
                          git add -f app.log
                          git commit -m "Updating products.csv and app.log"
                          git push origin HEAD:main
                       '''
                }
            }
        }
    }
}
