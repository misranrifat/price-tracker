pipeline {
    agent any
    
    environment {
        PYTHON_PATH = '/Library/Frameworks/Python.framework/Versions/3.12/bin/python3'
        VENV_DIR = 'virtual_env'
        VENV_BIN = "${VENV_DIR}/bin"
        GIT_AUTHOR_NAME = 'Jenkins Pipeline'
    }
    
    options {
        // Add timeout and keep only last 10 builds
        timeout(time: 1, unit: 'HOURS')
        buildDiscarder(logRotator(numToKeepStr: '10'))
    }

    stages {
        stage('Clean Workspace') {
            steps {
                // Clean workspace before starting
                cleanWs()
                checkout scm
            }
        }

        stage('Setup Python Environment') {
            steps {
                script {
                    try {
                        // Create and activate virtual environment
                        sh """
                            ${PYTHON_PATH} -m venv ${VENV_DIR}
                            source ${VENV_BIN}/activate
                            ${VENV_BIN}/pip3 install --upgrade pip
                            ${VENV_BIN}/pip3 install -r requirements.txt
                        """
                    } catch (Exception e) {
                        error "Failed to setup Python environment: ${e.getMessage()}"
                    }
                }
            }
        }

        stage('Run Tracker') {
            steps {
                script {
                    try {
                        sh """
                            source ${VENV_BIN}/activate
                            ${VENV_BIN}/python3.12 tracker.py
                        """
                    } catch (Exception e) {
                        error "Failed to run tracker.py: ${e.getMessage()}"
                    }
                }
            }
        }

        stage('Push Changes') {
            steps {
                script {
                    try {
                        sh """
                            git config user.name "\${GIT_AUTHOR_NAME}"
                            git add -f products.csv app.log
                            git diff --cached --quiet || git commit -m "Update products.csv and app.log [skip ci]"
                            git push origin HEAD:main
                        """
                    } catch (Exception e) {
                        error "Failed to push changes: ${e.getMessage()}"
                    }
                }
            }
        }
    }

    post {
        always {
            // Clean up virtual environment
            sh "rm -rf ${VENV_DIR}"
        }
        success {
            echo 'Pipeline completed successfully!'
        }
        failure {
            echo 'Pipeline failed! Check the logs for details.'
        }
    }
}
