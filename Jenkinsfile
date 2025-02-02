pipeline {
    agent any
    
    environment {
        PATH = "/opt/homebrew/bin:$PATH"
        NODE_CMD = "/opt/homebrew/bin/node"
        NPM_CMD = "/opt/homebrew/bin/npm"
        GIT_AUTHOR_NAME = "Jenkins Pipeline"
    }

    options {
        timeout(time: 1, unit: 'HOURS')
        buildDiscarder(logRotator(numToKeepStr: '10'))
    }

    stages {
        stage('Debug Environment') {
            steps {
                script {
                    sh '''
                        echo "Current PATH: $PATH"
                        echo "Node version: $($NODE_CMD --version)"
                        echo "NPM version: $($NPM_CMD --version)"
                        which node
                        which npm
                    '''
                }
            }
        }

        stage('Clean Workspace') {
            steps {
                cleanWs()
                checkout scm
            }
        }

        stage('Setup Node Environment') {
            steps {
                script {
                    sh '''
                        export PATH="/opt/homebrew/bin:$PATH"
                        $NPM_CMD install
                    '''
                }
            }
        }

        stage('Run Tracker') {
            steps {
                script {
                    sh '''
                        export PATH="/opt/homebrew/bin:$PATH"
                        $NODE_CMD price-tracker.js
                    '''
                }
            }
        }

        stage('Push Changes') {
            steps {
                script {
                    sh '''
                        git config user.name "${GIT_AUTHOR_NAME}"
                        git add -f products.csv
                        git diff --cached --quiet || git commit -m "Updated products.csv [skip ci]"
                        git push origin HEAD:main || (git pull origin puppeteer --rebase && git push origin HEAD:main)
                    '''
                }
            }
        }
    }

    post {
        always {
            sh "rm -rf node_modules"
            cleanWs()
        }
        success {
            echo 'Pipeline completed successfully!'
        }
        failure {
            echo 'Pipeline failed! Check the logs for details.'
        }
    }
}
