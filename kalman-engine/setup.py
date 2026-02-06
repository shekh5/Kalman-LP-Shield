"""
KalmanGuard - Python Kalman Filter Engine
Setup configuration for the kalman-engine package.
"""

from setuptools import setup, find_packages

setup(
    name="kalmanguard-engine",
    version="1.0.0",
    description="Adaptive Kalman filtering engine for DeFi risk management",
    author="KalmanGuard Team",
    author_email="team@kalmanguard.xyz",
    packages=find_packages(),
    python_requires=">=3.10",
    install_requires=[
        "numpy>=1.24.0",
        "scipy>=1.10.0",
        "pandas>=2.0.0",
        "scikit-learn>=1.2.0",
        "statsmodels>=0.14.0",
        "web3>=6.0.0",
        "aiohttp>=3.8.0",
        "pydantic>=2.0.0",
        "structlog>=23.1.0",
    ],
    extras_require={
        "dev": [
            "pytest>=7.3.0",
            "pytest-asyncio>=0.21.0",
            "pytest-cov>=4.1.0",
            "mypy>=1.3.0",
        ],
        "viz": [
            "matplotlib>=3.7.0",
            "plotly>=5.14.0",
        ],
    },
    entry_points={
        "console_scripts": [
            "kalmanguard-backtest=backtesting.cli:main",
        ],
    },
    classifiers=[
        "Development Status :: 4 - Beta",
        "Intended Audience :: Developers",
        "License :: OSI Approved :: MIT License",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Topic :: Scientific/Engineering :: Mathematics",
        "Topic :: Office/Business :: Financial",
    ],
)
