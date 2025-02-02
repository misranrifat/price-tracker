pipeline {
    agent any
    
    environment {
        NPM_PATH = '/opt/homebrew/bin/npm'
        NODE_PATH = '/opt/homebrew/bin/node'
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
                            ${NPM_PATH} install
                        """
                    } catch (Exception e) {
                        currentBuild.result = 'FAILURE'
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
                            ${NODE_PATH} price-tracker.js
                        """
                    } catch (Exception e) {
                        currentBuild.result = 'FAILURE'
                        error "Failed to run price-tracker.js: ${e.getMessage()}"
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
                            git config user.email "\${GIT_AUTHOR_EMAIL}"
                            git add -f products.csv
                            git diff --cached --quiet || git commit -m "Updated products.csv [skip ci]"
                            git push origin HEAD:puppeteer || (git pull origin puppeteer --rebase && git push origin HEAD:puppeteer)
                        """
                    } catch (Exception e) {
                        currentBuild.result = 'FAILURE'
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
            cleanWs()
        }
        success {
            echo 'Pipeline completed successfully!'
        }
        failure {
            echo 'Pipeline failed! Check the logs for details.'
            // You might want to add notification here
            // emailext or slackSend depending on your setup
        }
    }
}
