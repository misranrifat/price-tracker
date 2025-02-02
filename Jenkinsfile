pipeline {
    agent any
    
    environment {
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

        stage('Setup Node Environment') {
            steps {
                script {
                    try {

                        sh """
                            npm install
                        """
                    } catch (Exception e) {
                        error "Failed to setup node modules: ${e.getMessage()}"
                    }
                }
            }
        }

        stage('Run Tracker') {
            steps {
                script {
                    try {
                        sh """
                            node price-tracker.js
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
                            git add -f products.csv
                            git diff --cached --quiet || git commit -m "Updated products.csv"
                            git push origin HEAD:puppeteer
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
            sh "rm -rf node_modules"
        }
        success {
            echo 'Pipeline completed successfully!'
        }
        failure {
            echo 'Pipeline failed! Check the logs for details.'
        }
    }
}